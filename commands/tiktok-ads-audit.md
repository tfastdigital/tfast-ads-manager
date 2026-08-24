---
name: tiktok-ads-audit
description: |
  30-day comprehensive TikTok Ads health audit. Checks TikTok Pixel / Events API integrity, scans creative fatigue across the account (VVR + hook decay), profiles audience-segment spend split, surfaces ROAS/CPA outliers (top + bottom decile), evaluates budget allocation efficiency, and produces a professional written report. Read-only — no changes applied. Use for quarterly reviews, new-account onboarding, or any "what's actually happening in this account" deep dive.
argument-hint: "[Advertiser ID]"
---

# TikTok Ads Audit — 30 Days (Read-Only)

Comprehensive health audit of TikTok advertiser account `$ARGUMENTS`. **Read-only — produces analysis only, never applies changes.**

## Sections to cover

### 1. Tracking integrity
- Pixel events firing in the last 30d (Page View, View Content, Add to Cart, Complete Payment)
- Events API vs Pixel delta on Complete Payment — flag if > 15% mismatch
- iOS 14+ signal loss — note ATT impact expectations
- Recommendation: any missing events or gaps in Events API coverage

### 2. Spend distribution
- Top 5 campaigns by spend, % of total
- Top 5 ad groups by spend within those campaigns
- Pareto check — is 80% of spend concentrated in < 20% of entities? (healthy or risky?)

### 3. Performance — ROAS / CPA outliers
- Identify ad groups in top decile of ROAS (scaling candidates)
- Identify ad groups in bottom decile of ROAS or above-target CPA (cut candidates)
- For each outlier: 30d trend (improving / declining / volatile)

### 4. Creative fatigue scan
- Per ad: hook rate (2s views %), VVR, frequency, CTR delta vs ad-group median
- Score each ad as `Healthy / Early Warning / Fatigued / Dead`
- Surface top 10 fatigued ads with specific refresh recommendations
- Flag Spark Ads whose organic posts are aging out (> 90 days or decaying engagement)

### 5. Audience segment split
- Spend share by audience type (broad, interest, lookalike, custom/retargeting)
- ROAS per audience type
- Recommendation: is the mix balanced? Over-indexed on saturated audiences? Too narrow?

### 6. Budget allocation efficiency
- Compare budget % to revenue % per campaign/ad group
- Identify entities where budget % >> revenue % (over-funded)
- Identify entities where budget % << revenue % (under-funded relative to performance)

## Output format

A clean structured report. Use sections, tables for outliers, and a short **Top 5 priorities** section at the end.

End with: `_Audit complete — no changes applied. Use this report to plan optimization passes._`
