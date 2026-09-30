import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@clubhouse/client';
import { OnboardingRequest, type GoalType } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { Splash } from '@/app/Splash';
import { firstName } from '@/features/format';
import { useMe, type Me } from '@/features/me';
import { qk } from '@/features/keys';
import { deviceTimezone, useSubmitOnboarding, useUpdatePreferences } from '@/features/onboarding';
import { memberNow } from '@/features/summary';
import { Button } from '@/ui/atoms/Button';
import { aboutFromProfile, parseAbout, parseTargetWeightKg, previewTargets, minTargetDate, type About, type AboutDraft, type AboutErrors, type GoalDraft } from '@/ui/organisms/onboarding/model';
import { ProgressPills } from '@/ui/organisms/onboarding/ProgressPills';
import { StepAbout } from '@/ui/organisms/onboarding/StepAbout';
import { StepGoal } from '@/ui/organisms/onboarding/StepGoal';
import { StepInstall, type AiChoices } from '@/ui/organisms/onboarding/StepInstall';
import { StepLoop } from '@/ui/organisms/onboarding/StepLoop';

const TOTAL = 4;
const TITLES = ['About you', 'Your goal', 'Stay in the loop', 'One tap away'] as const;

export function OnboardingPage() {
  const me = useMe();
  const navigate = useNavigate();
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) void navigate({ to: '/login', replace: true });
  }, [me.error, navigate]);
  if (!me.data) return <Splash offline={!!me.error && !(me.error instanceof ApiError)} />;
  return <Onboarding me={me.data} />;
}

function Onboarding({ me }: { me: Me }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const search = useSearch({ from: '/onboarding' });
  const step = search.step ?? 1;
  const today = memberNow(me).date;
  const name = firstName(me.user.displayName);

  const [about, setAbout] = useState<AboutDraft>(() => aboutFromProfile({ ...me.profile, units: me.profile.units ?? me.team.units }, me.profile.timezone && me.user.onboarded ? me.profile.timezone : deviceTimezone(me.team.timezone)));
  const [aboutErrors, setAboutErrors] = useState<AboutErrors>({});
  const [goal, setGoal] = useState<GoalDraft>(() => ({
    goal: me.profile.goalType ?? 'lose',
    mode: me.profile.targetDate ? 'date' : 'pace',
    pace: me.profile.paceKgWeek ?? 0.5,
    targetWeight: me.profile.targetWeightKg ? String(me.profile.targetWeightKg) : '',
    targetDate: me.profile.targetDate ?? '',
  }));
  const [dateError, setDateError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiChoices>({ photo: !me.profile.aiOptOuts.photo, summary: !me.profile.aiOptOuts.summary });
  const [submitted, setSubmitted] = useState(me.user.onboarded);
  const [finishing, setFinishing] = useState(false);
  const submit = useSubmitOnboarding();
  const prefs = useUpdatePreferences();

  const prevStep = useRef(step);
  const dir = step >= prevStep.current ? 1 : -1;
  useEffect(() => {
    prevStep.current = step;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [step, reduce]);

  const parsedAbout = parseAbout(about, today).value;
  const go = (s: number) => void navigate({ to: '/onboarding', search: { step: s } });

  // Deep links past the targets step only make sense once targets are saved.
  const aboutOk = !!parsedAbout;
  useEffect(() => {
    if (step >= 2 && !aboutOk) void navigate({ to: '/onboarding', search: { step: 1 }, replace: true });
    else if (step >= 3 && !submitted) void navigate({ to: '/onboarding', search: { step: 2 }, replace: true });
  }, [step, aboutOk, submitted, navigate]);

  const nextFromAbout = () => {
    const r = parseAbout(about, today);
    setAboutErrors(r.errors);
    if (r.value) go(2);
    else toast.show('A couple of things still need you.');
  };

  const saveTargets = (a: About, goalType: GoalType) => {
    const byDate = goalType !== 'maintain' && goal.mode === 'date';
    if (byDate && (!goal.targetDate || goal.targetDate < minTargetDate(today))) {
      setDateError('Pick a date at least two weeks away.');
      return;
    }
    if (byDate && parseTargetWeightKg(goal, a.units) == null) {
      setDateError('Add the weight you’re aiming for below.');
      return;
    }
    setDateError(null);
    const body = OnboardingRequest.safeParse({
      units: a.units,
      heightCm: a.heightCm,
      weightKg: a.weightKg,
      dob: a.dob,
      sex: a.sex,
      activityLevel: a.activityLevel,
      goalType,
      paceKgWeek: goalType === 'maintain' || byDate ? null : goal.pace,
      targetWeightKg: goalType === 'maintain' ? null : parseTargetWeightKg(goal, a.units),
      targetDate: byDate ? goal.targetDate : null,
      timezone: a.timezone,
    });
    if (!body.success) {
      toast.error(body.error.issues[0]?.message ?? 'Check your details and try again.');
      return;
    }
    submit.mutate(body.data, {
      onSuccess: () => {
        setSubmitted(true);
        go(3);
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Couldn’t save your targets. Check your connection and try again.'),
    });
  };

  const finish = async () => {
    setFinishing(true);
    if (me.ai.teamOn) {
      try {
        await prefs.mutateAsync({ aiOptOuts: { photo: !ai.photo, summary: !ai.summary, noticeSeen: true } });
      } catch {
        /* the choice can be changed later in Settings */
      }
    }
    qc.setQueryData<Me>(qk.me, (m) => (m ? { ...m, user: { ...m.user, onboarded: true } } : m));
    void qc.invalidateQueries({ queryKey: qk.me });
    const targets = qc.getQueryData<Me>(qk.me)?.targets;
    await navigate({ to: '/', search: {}, replace: true });
    toast.success(`Welcome to the Clubhouse, ${name}`);
    if (targets?.explanation) setTimeout(() => toast.show(targets.explanation), 900);
  };

  const heading = [`Hi ${name}. Tell us about you`, `What are we chasing, ${name}?`, 'Stay in the loop', 'Keep Clubhouse one tap away'][step - 1];
  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 40 }),
    center: { opacity: 1, x: 0, transition: reduce ? { duration: 0.12 } : { type: 'spring' as const, stiffness: 300, damping: 30 } },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -40, transition: { duration: 0.15 } }),
  };

  return (
    <div className="min-h-dvh bg-bg text-text">
      <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-[22px] px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
        <ProgressPills step={step} total={TOTAL} />
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" className="flex flex-1 flex-col gap-[22px]" aria-labelledby="onb-title">
            <header className="flex flex-col gap-1.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent-700">
                Step {step} of {TOTAL} · {TITLES[step - 1]}
              </div>
              <h1 id="onb-title" className="font-heading text-[32px] leading-[1.08]">
                {heading}
              </h1>
            </header>

            {step === 1 && <StepAbout value={about} onChange={setAbout} errors={aboutErrors} today={today} />}
            {step === 2 && parsedAbout && <StepGoal about={parsedAbout} value={goal} onChange={setGoal} today={today} dateError={dateError} />}
            {step === 3 && <StepLoop vapidPublicKey={me.vapidPublicKey} />}
            {step === 4 && <StepInstall aiOn={me.ai.teamOn} ai={ai} onAiChange={setAi} />}

            <div className="mt-auto flex flex-col gap-2 pt-2">
              {step === 1 && (
                <Button size="lg" block onClick={nextFromAbout}>
                  Next
                </Button>
              )}
              {step === 2 && parsedAbout && (
                <>
                  <Button size="lg" block loading={submit.isPending && submit.variables?.goalType === goal.goal} onClick={() => saveTargets(parsedAbout, goal.goal)}>
                    Lock in {previewTargets(parsedAbout, goal.goal, goal, today).kcal.toLocaleString('en-IN')} kcal
                  </Button>
                  <Button variant="ghost" size="sm" disabled={submit.isPending} onClick={() => saveTargets(parsedAbout, 'maintain')}>
                    Skip for now — start at hold steady
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => go(1)}>
                    Back
                  </Button>
                </>
              )}
              {step === 3 && (
                <Button size="lg" block variant="secondary" onClick={() => go(4)}>
                  Next
                </Button>
              )}
              {step === 4 && (
                <Button size="lg" block loading={finishing} onClick={() => void finish()}>
                  Start logging
                </Button>
              )}
              {step >= 3 && step < TOTAL && (
                <Button variant="ghost" size="sm" onClick={() => go(TOTAL)}>
                  Skip
                </Button>
              )}
            </div>
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  );
}
