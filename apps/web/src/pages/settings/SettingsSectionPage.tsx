import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { MotionConfig, motion } from 'motion/react';
import { fadeUp } from '@clubhouse/ui';
import { Button } from '@/ui/atoms/Button';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { ActivityPlanSection } from '@/ui/organisms/settings/ActivityPlanSection';
import { AppSection } from '@/ui/organisms/settings/AppSection';
import { GoalSection } from '@/ui/organisms/settings/GoalSection';
import { NotificationsSection } from '@/ui/organisms/settings/NotificationsSection';
import { ProfileSection } from '@/ui/organisms/settings/ProfileSection';
import { SecuritySection } from '@/ui/organisms/settings/SecuritySection';
import { isSection, SECTIONS, type SectionKey } from '@/ui/organisms/settings/sections';
import { AiSection, DietPrefsSection, MomentumSection, PrivacySection } from '@/ui/organisms/settings/SmallSections';

const BODY: Record<SectionKey, () => React.ReactNode> = {
  profile: ProfileSection,
  goal: GoalSection,
  notifications: NotificationsSection,
  'activity-plan': ActivityPlanSection,
  'diet-preferences': DietPrefsSection,
  ai: AiSection,
  privacy: PrivacySection,
  momentum: MomentumSection,
  security: SecuritySection,
  app: AppSection,
};

/** /settings/$section — one settings area, in the design's grouped toggle-list style. */
export function SettingsSectionPage() {
  const { section } = useParams({ strict: false }) as { section?: string };
  const router = useRouter();
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/settings' }));
  const known = isSection(section);
  const Body = known ? BODY[section] : null;
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
        <StackHeader title={known ? SECTIONS[section].title : 'Settings'} onBack={back} />
        <motion.div variants={fadeUp} initial="hidden" animate="show" key={section}>
          {Body ? (
            <Body />
          ) : (
            <EmptyState
              title="That setting moved"
              body="We couldn’t find that page. Head back to Settings to find what you need."
              action={
                <Button onClick={() => void navigate({ to: '/settings' })} size="sm">
                  Back to Settings
                </Button>
              }
            />
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
}
