/**
 * Chinese display labels for the pipeline, report tabs and event stream.
 *
 * The protocol always carries the canonical English agent / section names;
 * translation is presentation-only and lives here so a missing entry degrades
 * to the raw name instead of breaking the layout.
 */

import type { SectionKey } from './protocol'

export const TEAM_LABELS: Record<string, string> = {
  'Analyst Team': '分析师团队',
  'Research Team': '研究团队',
  'Trading Team': '交易团队',
  'Risk Management': '风险管理',
  'Portfolio Management': '投资组合'
}

export const TEAM_ICONS: Record<string, string> = {
  'Analyst Team': 'chart',
  'Research Team': 'users',
  'Trading Team': 'trending',
  'Risk Management': 'shield',
  'Portfolio Management': 'briefcase'
}

export const AGENT_LABELS: Record<string, string> = {
  'Market Analyst': '市场分析师',
  'Sentiment Analyst': '情绪分析师',
  'News Analyst': '新闻分析师',
  'Fundamentals Analyst': '基本面分析师',
  'Bull Researcher': '多头研究员',
  'Bear Researcher': '空头研究员',
  'Research Manager': '研究经理',
  Trader: '交易员',
  'Aggressive Analyst': '激进分析师',
  'Neutral Analyst': '中立分析师',
  'Conservative Analyst': '保守分析师',
  'Portfolio Manager': '投资组合经理'
}

export const ANALYST_LABELS: Record<string, string> = {
  market: '市场分析师',
  social: '情绪分析师',
  news: '新闻分析师',
  fundamentals: '基本面分析师'
}

export const SECTION_LABELS: Record<SectionKey, string> = {
  market_report: '市场分析',
  sentiment_report: '社交情绪',
  news_report: '新闻分析',
  fundamentals_report: '基本面',
  investment_plan: '研究辩论',
  trader_investment_plan: '交易计划',
  final_trade_decision: '最终决策'
}

export const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成'
}

/** Five-tier rating -> short badge text; REVIEW stays explicit, never "Hold". */
export const SIGNAL_LABELS: Record<string, string> = {
  Buy: 'Buy',
  Overweight: 'O/W',
  Hold: 'Hold',
  Underweight: 'U/W',
  Sell: 'Sell',
  REVIEW: '待复核'
}

export function agentLabel(agent: string): string {
  return AGENT_LABELS[agent] ?? agent
}

export function teamLabel(team: string): string {
  return TEAM_LABELS[team] ?? team
}
