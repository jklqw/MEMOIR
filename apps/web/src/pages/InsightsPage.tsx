import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Flame,
  Info,
  Lock,
  PenTool,
  Sparkles,
  Tag,
  Unlock,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../components/ui/Button.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { useMemoriesList } from '../hooks/useMemories.js';
import { computeInsights } from '../services/insightsService.js';
import { useVaultStore } from '../stores/vaultStore.js';

export function InsightsPage() {
  const navigate = useNavigate();
  const { isUnlocked, isInitialized } = useVaultStore();
  const { data: memories = [], isLoading } = useMemoriesList({ includeArchived: true });

  const insights = useMemo(() => {
    return computeInsights(memories);
  }, [memories]);

  if (!isUnlocked && isInitialized) {
    return (
      <div className="space-y-6">
        <div className="pb-4 border-b border-border">
          <h1 className="font-serif text-2xl font-semibold text-ink">Personal Insights</h1>
          <p className="text-xs text-ink-muted mt-1">
            Writing streaks and reflective patterns computed 100% locally in browser memory.
          </p>
        </div>

        <div className="p-8 text-center bg-surface border border-border rounded-lg space-y-4 max-w-lg mx-auto my-8">
          <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 stroke-[1.5]" />
          </div>
          <div>
            <h2 className="text-base font-serif font-semibold text-ink">Vault is Locked</h2>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
              Unlock your local vault with your Vault Passphrase so your browser can decrypt your
              memories in volatile RAM and compute your private insights.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              // Trigger navigation to unlock or dispatch unlock modal
              window.dispatchEvent(new CustomEvent('memoir:open-vault-unlock'));
            }}
            className="text-xs"
          >
            <Unlock className="w-3.5 h-3.5 mr-1" />
            Unlock Vault to View Insights
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Personal Insights</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Reflective patterns and habits computed 100% locally in your browser’s volatile RAM.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-ink-subtle bg-surface/60 px-2.5 py-1 rounded border border-border">
          <Sparkles className="w-3.5 h-3.5 text-accent stroke-[1.5]" />
          <span>Zero telemetry or analytics sent to server</span>
        </div>
      </div>

      {/* Mandatory Non-Diagnostic Notice */}
      <div
        role="region"
        aria-label="Reflective Non-Diagnostic Notice"
        className="p-4 bg-surface border border-border/80 rounded-lg flex items-start gap-3 shadow-xs"
      >
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5 stroke-[1.5]" />
        <p className="text-xs text-ink-muted leading-relaxed">
          <strong className="text-ink font-medium">Reflective Notice:</strong> Personal Insights
          are computed 100% in your browser for personal reflection only and do not constitute
          clinical or psychological diagnostic advice. Memoir never interprets your thoughts or
          sends raw content to machine-learning models.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center space-y-2">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-ink-muted">Analyzing decrypted memory in RAM...</p>
        </div>
      ) : memories.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No Memories to Analyze Yet"
          description="Start journaling in your private archive. As you record entries and tag moods, personal trends and writing streaks will appear here."
          actionLabel="Write First Entry"
          onAction={() => navigate('/journal')}
        />
      ) : (
        <>
          {/* Key Stat Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-medium">Total Entries</span>
                <BookOpen className="w-4 h-4 text-accent stroke-[1.5]" />
              </div>
              <p className="text-2xl font-serif font-bold text-ink">{insights.totalMemories}</p>
              <p className="text-[11px] text-ink-subtle">
                {insights.streaks.totalActiveDays} active writing days
              </p>
            </div>

            <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-medium">Words Written</span>
                <PenTool className="w-4 h-4 text-accent stroke-[1.5]" />
              </div>
              <p className="text-2xl font-serif font-bold text-ink">
                {insights.totalWords.toLocaleString()}
              </p>
              <p className="text-[11px] text-ink-subtle">
                ~{Math.round(insights.totalWords / Math.max(1, insights.totalMemories))} words / entry
              </p>
            </div>

            <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-medium">Current Streak</span>
                <Flame className="w-4 h-4 text-amber-500 stroke-[1.5]" />
              </div>
              <p className="text-2xl font-serif font-bold text-ink">
                {insights.streaks.currentStreak}{' '}
                <span className="text-xs font-sans font-normal text-ink-muted">
                  {insights.streaks.currentStreak === 1 ? 'day' : 'days'}
                </span>
              </p>
              <p className="text-[11px] text-ink-subtle">
                {insights.streaks.currentStreak > 0
                  ? 'Keep your momentum going'
                  : 'Write today to build a streak'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-medium">Longest Streak</span>
                <Award className="w-4 h-4 text-accent stroke-[1.5]" />
              </div>
              <p className="text-2xl font-serif font-bold text-ink">
                {insights.streaks.longestStreak}{' '}
                <span className="text-xs font-sans font-normal text-ink-muted">
                  {insights.streaks.longestStreak === 1 ? 'day' : 'days'}
                </span>
              </p>
              <p className="text-[11px] text-ink-subtle">Personal best consistency</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mood Reflection Breakdown */}
            <div className="p-5 rounded-lg bg-surface border border-border space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Mood Distribution</h2>
                  <p className="text-xs text-ink-muted">
                    Proportion of tagged emotional states across entries
                  </p>
                </div>
              </div>

              {insights.moodDistribution.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink-muted">
                  No moods recorded yet. Tag a mood when saving an entry to visualize trends.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-56 w-full" style={{ minHeight: '224px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={insights.moodDistribution}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                      >
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="mood"
                          type="category"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: 'var(--color-ink-muted, #788896)', fontSize: 11 }}
                          width={75}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0]!.payload as {
                                mood: string;
                                count: number;
                                percentage: number;
                              };
                              return (
                                <div className="p-2 rounded bg-canvas border border-border text-xs shadow-md">
                                  <p className="font-semibold text-ink">{data.mood}</p>
                                  <p className="text-ink-muted">
                                    {data.count} entries ({data.percentage}%)
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {insights.moodDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                    {insights.moodDistribution.map((item) => (
                      <div
                        key={item.mood}
                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-canvas border border-border text-[11px]"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-medium text-ink">{item.mood}:</span>
                        <span className="text-ink-muted font-mono">{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Writing Rhythm (Day of Week) */}
            <div className="p-5 rounded-lg bg-surface border border-border space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">Writing Rhythm</h2>
                <p className="text-xs text-ink-muted">Frequency of writing across days of the week</p>
              </div>

              <div className="h-56 w-full" style={{ minHeight: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={insights.weekdayDistribution}
                    margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  >
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--color-ink-muted, #788896)', fontSize: 11 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--color-ink-muted, #788896)', fontSize: 11 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0]!.payload as { day: string; count: number };
                          return (
                            <div className="p-2 rounded bg-canvas border border-border text-xs shadow-md">
                              <p className="font-semibold text-ink">{data.day}</p>
                              <p className="text-ink-muted">{data.count} entries</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--color-accent, #708A81)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <p className="text-[11px] text-ink-subtle text-center pt-2 border-t border-border/50">
                Shows which days you naturally turn to your diary most often.
              </p>
            </div>
          </div>

          {/* Top Tags Cloud / List */}
          {insights.topTags.length > 0 && (
            <div className="p-5 rounded-lg bg-surface border border-border space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-accent stroke-[1.5]" />
                <h2 className="text-sm font-semibold text-ink">Most Frequent Private Tags</h2>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {insights.topTags.map((item) => (
                  <span
                    key={item.tag}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-canvas border border-border text-ink hover:border-accent/40 transition-colors"
                  >
                    <span className="text-accent">#</span>
                    <span>{item.tag}</span>
                    <span className="text-ink-subtle text-[10px]">({item.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
