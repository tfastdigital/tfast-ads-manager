/**
 * Deterministic detectors (Phase 5) — pure functions over snapshot
 * aggregates. No LLM in the loop: these produce the severity-ranked
 * findings that feed the Morning Brief and automation rules.
 */
export interface SnapshotRow {
  stat_date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  video_play_actions: number | null;
  video_watched_2s: number | null;
  frequency: number | null;
  ctr: number | null;
}

export interface WindowAgg {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  plays: number;
  views2s: number;
  ctr: number;
  cvr: number;   // conversions per click
  cpa: number;
  roas: number;
  vvr: number;   // plays / impressions
  hook: number;  // 2s views / plays
  frequency: number;
  days: number;
}

export function aggregate(rows: SnapshotRow[]): WindowAgg {
  let spend = 0, revenue = 0, conversions = 0, impressions = 0, clicks = 0,
    plays = 0, views2s = 0, freqSum = 0, freqN = 0;
  for (const r of rows) {
    spend += r.spend ?? 0;
    revenue += r.revenue ?? 0;
    conversions += r.conversions ?? 0;
    impressions += r.impressions ?? 0;
    clicks += r.clicks ?? 0;
    plays += r.video_play_actions ?? 0;
    views2s += r.video_watched_2s ?? 0;
    if (r.frequency != null) { freqSum += r.frequency; freqN += 1; }
  }
  return {
    spend, revenue, conversions, impressions, clicks, plays, views2s,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cvr: clicks > 0 ? conversions / clicks : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    roas: spend > 0 ? revenue / spend : 0,
    vvr: impressions > 0 ? plays / impressions : 0,
    hook: plays > 0 ? views2s / plays : 0,
    frequency: freqN > 0 ? freqSum / freqN : 0,
    days: rows.length,
  };
}

export type Severity = 'critical' | 'warning' | 'info';
export type FindingCategory =
  | 'abnormal_spend' | 'cpa_increase' | 'roas_decrease' | 'creative_fatigue'
  | 'tracking_failure' | 'conversion_anomaly' | 'scaling_candidate' | 'landing_page_issue';

export interface Finding {
  severity: Severity;
  category: FindingCategory;
  windowDays: number;
  message: string;
  metrics: Record<string, number>;
}

export interface DetectOptions {
  targetRoas: number;
  targetCpa: number; // Infinity allowed
  dailyCap?: number;
}

const pct = (curr: number, prior: number) => (prior === 0 ? (curr > 0 ? Infinity : 0) : (curr - prior) / prior);

export function detectChanges(curr: WindowAgg, prior: WindowAgg, windowDays: number, opts: DetectOptions): Finding[] {
  const findings: Finding[] = [];

  // Abnormal spend (either direction)
  const spendDelta = pct(curr.spend, prior.spend);
  if (Number.isFinite(spendDelta)) {
    const absDelta = Math.abs(spendDelta);
    if (absDelta >= 1) {
      findings.push({
        severity: 'critical',
        category: 'abnormal_spend',
        windowDays,
        message: `Spend ${spendDelta >= 0 ? 'up' : 'down'} ${(absDelta * 100).toFixed(0)}% vs prior ${windowDays}d ($${curr.spend.toFixed(0)} vs $${prior.spend.toFixed(0)}).`,
        metrics: { curr_spend: curr.spend, prior_spend: prior.spend, delta_pct: spendDelta * 100 },
      });
    } else if (absDelta >= 0.5) {
      findings.push({
        severity: 'warning',
        category: 'abnormal_spend',
        windowDays,
        message: `Spend ${spendDelta >= 0 ? 'up' : 'down'} ${(absDelta * 100).toFixed(0)}% vs prior ${windowDays}d.`,
        metrics: { curr_spend: curr.spend, prior_spend: prior.spend, delta_pct: spendDelta * 100 },
      });
    }
  }

  // CPA increase
  if (curr.cpa > 0 && prior.cpa > 0 && curr.conversions >= 1 && prior.conversions >= 1) {
    const cpaDelta = pct(curr.cpa, prior.cpa);
    if (cpaDelta >= 0.5) {
      findings.push({
        severity: 'critical',
        category: 'cpa_increase',
        windowDays,
        message: `CPA up ${(cpaDelta * 100).toFixed(0)}% ($${curr.cpa.toFixed(2)} vs $${prior.cpa.toFixed(2)}) vs prior ${windowDays}d.`,
        metrics: { curr_cpa: curr.cpa, prior_cpa: prior.cpa, delta_pct: cpaDelta * 100 },
      });
    } else if (cpaDelta >= 0.2) {
      findings.push({
        severity: 'warning',
        category: 'cpa_increase',
        windowDays,
        message: `CPA up ${(cpaDelta * 100).toFixed(0)}% ($${curr.cpa.toFixed(2)} vs $${prior.cpa.toFixed(2)}) vs prior ${windowDays}d.`,
        metrics: { curr_cpa: curr.cpa, prior_cpa: prior.cpa, delta_pct: cpaDelta * 100 },
      });
    }
  }

  // ROAS decrease
  if (prior.roas > 0 && curr.spend > 0) {
    const ratio = curr.roas / prior.roas;
    if (ratio < 0.6) {
      findings.push({
        severity: 'critical',
        category: 'roas_decrease',
        windowDays,
        message: `ROAS collapsed to ${curr.roas.toFixed(2)} from ${prior.roas.toFixed(2)} (−${((1 - ratio) * 100).toFixed(0)}%) vs prior ${windowDays}d.`,
        metrics: { curr_roas: curr.roas, prior_roas: prior.roas, ratio },
      });
    } else if (ratio < 0.8) {
      findings.push({
        severity: 'warning',
        category: 'roas_decrease',
        windowDays,
        message: `ROAS down to ${curr.roas.toFixed(2)} from ${prior.roas.toFixed(2)} (−${((1 - ratio) * 100).toFixed(0)}%) vs prior ${windowDays}d.`,
        metrics: { curr_roas: curr.roas, prior_roas: prior.roas, ratio },
      });
    }
  }

  // Conversion anomaly (spend stable, conversions falling)
  const stableSpend = Math.abs(pct(curr.spend, prior.spend)) <= 0.1;
  if (stableSpend && prior.conversions >= 5) {
    const convDelta = pct(curr.conversions, prior.conversions);
    if (convDelta <= -0.4) {
      findings.push({
        severity: 'warning',
        category: 'conversion_anomaly',
        windowDays,
        message: `Conversions down ${(-convDelta * 100).toFixed(0)}% with stable spend (${curr.conversions} vs ${prior.conversions}).`,
        metrics: { curr_conversions: curr.conversions, prior_conversions: prior.conversions, delta_pct: convDelta * 100 },
      });
    }
  }

  // Creative fatigue (VVR decay + frequency)
  if (prior.vvr > 0 && curr.impressions > 0) {
    const vvrDrop = 1 - curr.vvr / prior.vvr;
    if (vvrDrop >= 0.25 && curr.frequency >= 3) {
      findings.push({
        severity: 'critical',
        category: 'creative_fatigue',
        windowDays,
        message: `Creative fatigue: VVR down ${(vvrDrop * 100).toFixed(0)}% with frequency ${curr.frequency.toFixed(1)} — refresh hooks.`,
        metrics: { curr_vvr: curr.vvr, prior_vvr: prior.vvr, frequency: curr.frequency },
      });
    } else if (vvrDrop >= 0.15 && curr.frequency >= 2.5) {
      findings.push({
        severity: 'warning',
        category: 'creative_fatigue',
        windowDays,
        message: `Early fatigue: VVR down ${(vvrDrop * 100).toFixed(0)}% (frequency ${curr.frequency.toFixed(1)}) — plan a refresh.`,
        metrics: { curr_vvr: curr.vvr, prior_vvr: prior.vvr, frequency: curr.frequency },
      });
    }
  }

  // Landing page issue: CTR stable, click-through CVR falling
  const ctrStable = Math.abs(pct(curr.ctr, prior.ctr)) <= 0.15;
  if (ctrStable && prior.cvr > 0 && curr.clicks > 0) {
    const cvrDrop = 1 - curr.cvr / prior.cvr;
    if (cvrDrop >= 0.3) {
      findings.push({
        severity: 'warning',
        category: 'landing_page_issue',
        windowDays,
        message: `Funnel break: CTR stable but click-to-conversion rate down ${(cvrDrop * 100).toFixed(0)}% — check landing page.`,
        metrics: { curr_cvr: curr.cvr, prior_cvr: prior.cvr },
      });
    }
  }

  // Scaling candidate
  if (curr.roas >= opts.targetRoas * 1.1 && opts.dailyCap != null && opts.dailyCap > 0) {
    const dailySpend = curr.days > 0 ? curr.spend / curr.days : 0;
    const utilization = dailySpend / opts.dailyCap;
    if (utilization >= 0.9) {
      findings.push({
        severity: 'info',
        category: 'scaling_candidate',
        windowDays,
        message: `Scaling candidate: ROAS ${curr.roas.toFixed(2)} ≥ 1.1× target (${opts.targetRoas}) and daily spend at ${(utilization * 100).toFixed(0)}% of cap.`,
        metrics: { roas: curr.roas, target_roas: opts.targetRoas, utilization },
      });
    }
  }

  // CPA vs target (context, informational)
  if (curr.cpa > 0 && Number.isFinite(opts.targetCpa) && curr.cpa > opts.targetCpa * 1.2) {
    findings.push({
      severity: 'info',
      category: 'cpa_increase',
      windowDays,
      message: `CPA $${curr.cpa.toFixed(2)} is ${((curr.cpa / opts.targetCpa - 1) * 100).toFixed(0)}% above target $${opts.targetCpa.toFixed(2)}.`,
      metrics: { cpa: curr.cpa, target_cpa: opts.targetCpa },
    });
  }

  return findings;
}

export function rankFindings(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity] || a.windowDays - b.windowDays);
}
