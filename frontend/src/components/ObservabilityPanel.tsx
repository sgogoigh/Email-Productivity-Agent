"use client";

import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
  ThumbsUp,
  Timer,
} from "lucide-react";
import type {
  ConversationSummary,
  DatabaseStatus,
  LLMExecutionLog,
  ObservabilityMetrics,
} from "@/types";

interface ObservabilityPanelProps {
  dbStatus: DatabaseStatus | null;
  metrics: ObservabilityMetrics | null;
  conversations: ConversationSummary[];
  logs: LLMExecutionLog[];
  busy: boolean;
  onRefresh: () => Promise<void>;
  onSelectConversation: (conversationId: string, emailId?: string | null) => void;
}

const OP_BADGE: Record<string, string> = {
  categorize:
    "bg-indigo-50 text-indigo-700 ring-indigo-200/80 dark:bg-indigo-950/70 dark:text-indigo-300 dark:ring-indigo-800/70",
  extract_actions:
    "bg-amber-50 text-amber-800 ring-amber-200/80 dark:bg-amber-950/70 dark:text-amber-300 dark:ring-amber-800/70",
  chat: "bg-violet-50 text-violet-700 ring-violet-200/80 dark:bg-violet-950/70 dark:text-violet-300 dark:ring-violet-800/70",
  generate_draft:
    "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:ring-emerald-800/70",
};

export function ObservabilityPanel({
  dbStatus,
  metrics,
  conversations,
  logs,
  busy,
  onRefresh,
  onSelectConversation,
}: ObservabilityPanelProps) {
  const [operationFilter, setOperationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchId, setSearchId] = useState("");

  const filteredLogs = logs.filter((log) => {
    if (operationFilter !== "all" && log.operation !== operationFilter) return false;
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    if (searchId.trim()) {
      const q = searchId.trim().toLowerCase();
      const hay = `${log.conversation_id ?? ""} ${log.email_id ?? ""} ${log.prompt_hash ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const approvalPct = metrics?.approval_rate_pct ?? null;

  return (
    <section className="space-y-5">
      {/* Header & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-5 text-white shadow-sm dark:border-slate-800">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-300 ring-1 ring-white/15">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">
              Telemetry, Quality &amp; System Health
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Live database health pings, conversation sessions linked to email IDs,
              latency distributions, token usage, and quality ratings.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRefresh()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50 dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-500"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          Ping DB &amp; Refresh Metrics
        </button>
      </div>

      {/* Database Connectivity & KPI Cards */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-2xl border border-emerald-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-emerald-500/10 dark:border-emerald-900/60 dark:bg-slate-900/90 lg:col-span-5">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400">
                <Database className="h-4 w-4" />
              </span>
              Database Connectivity
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:ring-emerald-800/70">
              <CheckCircle2 className="h-3 w-3" />
              {dbStatus?.status ?? "unknown"}
            </span>
          </div>

          {dbStatus ? (
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Dialect
                  </span>
                  <span className="mt-0.5 block font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {dbStatus.dialect}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Ping Latency
                  </span>
                  <span className="mt-0.5 block font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {dbStatus.db_latency_ms} ms
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Journal / Pool
                  </span>
                  <span className="mt-0.5 block truncate font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {dbStatus.wal_mode || String(dbStatus.pool?.pool_class ?? "pooled")}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {Object.entries(dbStatus.table_counts).map(([table, count]) => (
                  <div
                    key={table}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/40 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <span className="block truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      {table}
                    </span>
                    <span className="mt-0.5 block text-base font-bold tabular-nums text-slate-900 dark:text-white">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Loading database status...</p>
          )}
        </div>

        {/* Quality & Timing KPIs */}
        <div className="grid gap-3.5 sm:grid-cols-3 lg:col-span-7">
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Timer className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              Timing (Avg / P95)
            </div>
            <p className="mt-2.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {metrics ? `${metrics.avg_latency_ms.toFixed(0)} ms` : "—"}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              P95: {metrics ? `${metrics.p95_latency_ms.toFixed(0)} ms` : "—"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Reliability &amp; Tokens
            </div>
            <p className="mt-2.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {metrics ? `${metrics.success_rate_pct}%` : "—"}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {metrics
                ? `${metrics.total_calls} calls · ${metrics.total_tokens.toLocaleString()} tokens`
                : "—"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <ThumbsUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              Quality Feedback
            </div>
            <p className="mt-2.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {approvalPct != null ? `${approvalPct}%` : "No ratings"}
            </p>
            {approvalPct != null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, approvalPct))}%` }}
                />
              </div>
            )}
            <p className="mt-1.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {metrics
                ? `+${metrics.positive_ratings} / -${metrics.negative_ratings} (${metrics.total_conversations} convs)`
                : "—"}
            </p>
          </div>

          {/* Per-Operation Breakdown */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 sm:col-span-3">
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Latency &amp; Tokens by Operation
            </h3>
            {metrics && metrics.by_operation.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-1.5 pr-3">Operation</th>
                      <th className="py-1.5 pr-3">Calls</th>
                      <th className="py-1.5 pr-3">Errors</th>
                      <th className="py-1.5 pr-3">Avg ms</th>
                      <th className="py-1.5 pr-3">P95 ms</th>
                      <th className="py-1.5">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
                    {metrics.by_operation.map((op) => (
                      <tr
                        key={op.operation}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ring-1 ${
                              OP_BADGE[op.operation] ??
                              "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                            }`}
                          >
                            {op.operation}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200">
                          {op.count}
                        </td>
                        <td className="py-2 pr-3 text-rose-600 dark:text-rose-400">
                          {op.error_count}
                        </td>
                        <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-300">
                          {op.avg_latency_ms}
                        </td>
                        <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-300">
                          {op.p95_latency_ms}
                        </td>
                        <td className="py-2 font-mono text-slate-700 dark:text-slate-300">
                          {op.total_tokens.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No LLM operations recorded yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Logged Conversations */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Logged Conversations ({conversations.length})
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Click a conversation ID to filter trace logs, or jump straight back into that
              Copilot thread.
            </p>
          </div>
        </div>
        {conversations.length === 0 ? (
          <p className="text-xs text-slate-400">
            No conversations yet. Ask a question in Email Agent Copilot to start a
            logged conversation.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3">Conversation ID</th>
                  <th className="py-2 pr-3">Scope</th>
                  <th className="py-2 pr-3">Email ID</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Turns</th>
                  <th className="py-2 pr-3">Avg Latency</th>
                  <th className="py-2 pr-3">Quality</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
                {conversations.map((conv) => (
                  <tr
                    key={conv.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-2.5 pr-3 font-mono text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSearchId(conv.id)}
                        className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {conv.id}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {conv.scope}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {conv.email_id ?? "inbox"}
                    </td>
                    <td className="max-w-xs truncate py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-100">
                      {conv.title}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-300">
                      {conv.message_count}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-slate-700 dark:text-slate-300">
                      {conv.avg_latency_ms != null ? `${conv.avg_latency_ms} ms` : "—"}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        +{conv.positive_ratings}
                      </span>{" "}
                      /{" "}
                      <span className="text-rose-600 dark:text-rose-400">
                        -{conv.negative_ratings}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectConversation(conv.id, conv.email_id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                      >
                        Open
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Trace Logs */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            LLM Execution Trace Logs ({filteredLogs.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <input
                type="search"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Filter conversation_id / email_id / hash..."
                className="rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
              />
            </div>
            <select
              aria-label="Filter operation"
              value={operationFilter}
              onChange={(e) => setOperationFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Operations</option>
              <option value="categorize">categorize</option>
              <option value="extract_actions">extract_actions</option>
              <option value="chat">chat</option>
              <option value="generate_draft">generate_draft</option>
            </select>
            <select
              aria-label="Filter status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="success">success</option>
              <option value="error">error</option>
            </select>
          </div>
        </div>

        <div className="sleek-scroll max-h-96 overflow-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur dark:bg-slate-950/95">
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Op</th>
                <th className="px-3 py-2">Email / Conv ID</th>
                <th className="px-3 py-2">Prompt Hash</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Latency</th>
                <th className="px-3 py-2">Tokens</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {new Date(log.started_at).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ring-1 ${
                        OP_BADGE[log.operation] ??
                        "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                      }`}
                    >
                      {log.operation}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {log.email_id ?? "—"}
                    {log.conversation_id ? ` · ${log.conversation_id}` : ""}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {log.prompt_hash ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                    {log.provider}/{log.model}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                    {log.latency_ms} ms
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                    {log.total_tokens}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        log.status === "success"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:ring-emerald-800/70"
                          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-950/70 dark:text-rose-300 dark:ring-rose-800/70"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
