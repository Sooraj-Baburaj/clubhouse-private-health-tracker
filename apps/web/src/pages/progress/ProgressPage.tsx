import { useSearch } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { usePaneRef } from '@/app/pane';
import { ActivitySection } from '@/ui/organisms/progress/ActivitySection';
import { CaloriesSection } from '@/ui/organisms/progress/CaloriesSection';
import { ConsistencySection } from '@/ui/organisms/progress/ConsistencySection';
import { HabitsSection } from '@/ui/organisms/progress/HabitsSection';
import { Section } from '@/ui/organisms/progress/Kit';
import { MomentumCard } from '@/ui/organisms/progress/MomentumCard';
import { NutrientsSection } from '@/ui/organisms/progress/NutrientsSection';
import { ExportCard, RecapsSection } from '@/ui/organisms/progress/RecapsSection';
import { WeightSection } from '@/ui/organisms/progress/WeightSection';

/**
 * Progress tab (plan §8.10): weight (3a) then weekly bands (3b), nutrients, activity vs plan, consistency,
 * momentum, the Team section, weekly recaps and export.
 */
export function ProgressPage() {
  const search = useSearch({ strict: false }) as { section?: string };
  const pane = usePaneRef();
  useEffect(() => {
    if (!search.section) return;
    const t = setTimeout(() => {
      const el = pane?.current?.querySelector(`#section-${CSS.escape(search.section!)}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => clearTimeout(t);
  }, [search.section, pane]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-3.5 px-5 pb-6 pt-2.5">
        <h1 className="sr-only">Progress</h1>
        <Section id="weight" label="Weight">
          <WeightSection />
        </Section>
        <Section id="calories" label="Calories" className="mt-4">
          <CaloriesSection />
        </Section>
        <Section id="nutrients" label="Nutrients" className="mt-4">
          <NutrientsSection />
        </Section>
        <Section id="activity" label="Activity" className="mt-4">
          <ActivitySection />
        </Section>
        <Section id="habits" label="Habits" className="mt-4 empty:hidden">
          <HabitsSection />
        </Section>
        <Section id="consistency" label="Consistency" className="mt-4">
          <ConsistencySection />
        </Section>
        <Section id="momentum" label="Momentum">
          <MomentumCard />
        </Section>
        <Section id="recaps" label="Weekly recaps" className="mt-4">
          <RecapsSection />
        </Section>
        <Section id="export" label="Export my data" className="mt-2">
          <ExportCard />
        </Section>
      </div>
    </MotionConfig>
  );
}
