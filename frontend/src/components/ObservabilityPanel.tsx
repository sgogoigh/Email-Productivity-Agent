"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  RefreshCw,
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
  onSelectConversation: (conversationId: string) => void;
}

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

  return (
    <section className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-slate-900 p-2 text-white">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Observability, Quality &amp; Database Connectivity
            </h2>
            <p className="text-xs text-slate-500">
              Tracks every LLM call, conversation ID, email ID, latency timing, token usage,
              and quality rating.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRefresh()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          Ping DB &amp; Refresh Metrics
        </button>
      </div>

      {/* Database Connectivity & KPI Cards */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Database className="h-4 w-4 text-emerald-600" />
              Database Connectivity
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
              <CheckCircle2 className="h-3 w-3" />
              {dbStatus?.status ?? "unknown"}
            </span>
          </div>

          {dbStatus ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3">
                <div>
                  <span className="block text-[10px] uppercase text-slate-400">Dialect</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {dbStatus.dialect}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-slate-400">
                    Ping Latency
                  </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {dbStatus.db_latency_ms} ms
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-slate-400">
                    Journal / Pool
                  </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {dbStatus.wal_mode || String(dbStatus.pool?.pool_class ?? "pooled")}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {Object.entries(dbStatus.table_counts).map(([table, count]) => (
                  <div
                    key={table}
                    className="rounded-lg border border-slate-200 px-2.5 py-2"
                  >
                    <span className="block truncate font-mono text-[10px] text-slate-500">
                      {table}
                    </span>
                    <span className="text-sm font-bold text-slate-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Loading database status...</p>
          )}
        </div>

        {/* Quality & Timing KPIs */}
        <div className="grid gap-3 sm:grid-cols-3 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Timer className="h-3.5 w-3.5 text-indigo-600" />
              Timing (Avg / P95)
            </div>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {metrics ? `${metrics.avg_latency_ms.toFixed(0)} ms` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              P95: {metrics ? `${metrics.p95_latency_ms.toFixed(0)} ms` : "—"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Activity className="h-3.5 w-3.5 text-emerald-600" />
              Reliability &amp; Parse
            </div>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {metrics ? `${metrics.success_rate_pct}%` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {metrics
                ? `${metrics.total_calls} calls · ${metrics.total_tokens.toLocaleString()} tokens`
                : "—"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <ThumbsUp className="h-3.5 w-3.5 text-amber-600" />
              Quality Feedback
            </div>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {metrics?.approval_rate_pct != null
                ? `${metrics.approval_rate_pct}%`
                : "No ratings"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {metrics
                ? `+${metrics.positive_ratings} / -${metrics.negative_ratings} (${metrics.total_conversations} convs)`
                : "—"}
            </p>
          </div>

          {/* Per-Operation Breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Latency &amp; Tokens by Operation
            </h3>
            {metrics && metrics.by_operation.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                      <th className="py-1.5 pr-3">Operation</th>
                      <th className="py-1.5 pr-3">Calls</th>
                      <th className="py-1.5 pr-3">Errors</th>
                      <th className="py-1.5 pr-3">Avg ms</th>
                      <th className="py-1.5 pr-3">P95 ms</th>
                      <th className="py-1.5">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.by_operation.map((op) => (
                      <tr key={op.operation}>
                        <td className="py-1.5 pr-3 font-mono font-semibold text-slate-800">
                          {op.operation}
                        </td>
                        <td className="py-1.5 pr-3">{op.count}</td>
                        <td className="py-1.5 pr-3 text-rose-600">{op.error_count}</td>
                        <td className="py-1.5 pr-3 font-mono">{op.avg_latency_ms}</td>
                        <td className="py-1.5 pr-3 font-mono">{op.p95_latency_ms}</td>
                        <td className="py-1.5 font-mono">{op.total_tokens}</td>
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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Logged Conversations ({conversations.length})
        </h3>
        {conversations.length === 0 ? (
          <p className="text-xs text-slate-400">
            No conversations yet. Ask a question in Email Agent Chat to start a logged
            conversation.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                  <th className="py-2 pr-3">Conversation ID</th>
                  <th className="py-2 pr-3">Scope</th>
                  <th className="py-2 pr-3">Email ID</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Turns</th>
                  <th className="py-2 pr-3">Avg Latency</th>
                  <th className="py-2">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conversations.map((conv) => (
                  <tr key={conv.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-mono text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchId(conv.id);
                          onSelectConversation(conv.id);
                        }}
                        className="text-indigo-600 hover:underline"
                      >
                        {conv.id}
                      </button>
                    </td>
                    <td className="py-2 pr-3">{conv.scope}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-slate-600">
                      {conv.email_id ?? "inbox"}
                    </td>
                    <td className="max-w-xs truncate py-2 pr-3 font-medium text-slate-800">
                      {conv.title}
                    </td>
                    <td className="py-2 pr-3">{conv.message_count}</td>
                    <td className="py-2 pr-3 font-mono">
                      {conv.avg_latency_ms != null ? `${conv.avg_latency_ms} ms` : "—"}
                    </td>
                    <td className="py-2">
                      <span className="text-emerald-700">+{conv.positive_ratings}</span> /{" "}
                      <span className="text-rose-600">-{conv.negative_ratings}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Trace Logs */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            LLM Execution Trace Logs ({filteredLogs.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Filter conversation_id / email_id / hash..."
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs focus:border-indigo-500 focus:outline-none"
            />
            <select
              aria-label="Filter operation"
              value={operationFilter}
              onChange={(e) => setOperationFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
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
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            >
              <option value="all">All Statuses</option>
              <option value="success">success</option>
              <option value="error">error</option>
            </select>
          </div>
        </div>

        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Op</th>
                <th className="py-2 pr-3">Email / Conv ID</th>
                <th className="py-2 pr-3">Prompt Hash</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Latency</th>
                <th className="py-2 pr-3">Tokens</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-[11px] text-slate-500">
                    {new Date(log.started_at).toLocaleTimeString()}
                  </td>
                  <td className="py-1.5 pr-3 font-mono font-semibold text-slate-800">
                    {log.operation}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-600">
                    {log.email_id ?? "—"}
                    {log.conversation_id ? ` · ${log.conversation_id}` : ""}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-500">
                    {log.prompt_hash ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-[11px]">
                    {log.provider}/{log.model}
                  </td>
                  <td className="py-1.5 pr-3 font-mono">{log.latency_ms} ms</td>
                  <td className="py-1.5 pr-3 font-mono">{log.total_tokens}</td>
                  <td className="py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        log.status === "success"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
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
