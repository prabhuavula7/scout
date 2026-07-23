"use client";

import { use, useEffect, useRef, useState } from "react";
import { MessageSquareText, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { EmptyState } from "@scout/ui";
import { useChatMessages, useSendChatMessage } from "@/lib/use-runs";

const MARKDOWN_COMPONENTS = {
  p: (props: React.ComponentPropsWithoutRef<"p">) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0" {...props} />
  ),
  ol: (props: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0" {...props} />
  ),
  code: (props: React.ComponentPropsWithoutRef<"code">) => (
    <code
      className="rounded bg-stone-200/70 px-1 py-0.5 font-mono text-xs dark:bg-stone-800"
      {...props}
    />
  ),
  pre: (props: React.ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="mb-2 overflow-x-auto rounded-lg bg-stone-200/70 p-2 text-xs last:mb-0 dark:bg-stone-800"
      {...props}
    />
  ),
  a: (props: React.ComponentPropsWithoutRef<"a">) => (
    <a
      className="underline underline-offset-2 hover:no-underline"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  strong: (props: React.ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold" {...props} />
  ),
};

function TypingBubble() {
  return (
    <div className="flex max-w-lg items-center gap-1 rounded-2xl rounded-bl-sm bg-stone-100 px-4 py-3 dark:bg-stone-900">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-stone-400 dark:bg-stone-500"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: messages } = useChatMessages(slug);
  const sendMessage = useSendChatMessage(slug);
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pendingMessage]);

  function submitDraft() {
    const trimmed = draft.trim();
    if (!trimmed || sendMessage.isPending) return;
    setPendingMessage(trimmed);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMessage.mutate(trimmed, { onSettled: () => setPendingMessage(null) });
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-14rem)] max-w-2xl flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto scrollbar-thin">
        {(!messages || messages.length === 0) && !pendingMessage && (
          <EmptyState
            icon={<MessageSquareText className="h-8 w-8" />}
            title="Ask about this platform"
            description='Try: "How does authentication work?" or "How do I paginate through results?"'
          />
        )}
        {messages?.map((message) => (
          <div
            key={message.id}
            className={`animate-fade-in rounded-2xl px-4 py-3 text-sm ${
              message.role === "user"
                ? "ml-auto max-w-md rounded-br-sm bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                : "max-w-lg rounded-bl-sm bg-stone-100 dark:bg-stone-900"
            }`}
          >
            {message.role === "assistant" ? (
              <ReactMarkdown components={MARKDOWN_COMPONENTS}>{message.content}</ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
            {message.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-300/50 pt-2 dark:border-stone-700/50">
                {message.citations.map((citation, i) => (
                  <a
                    key={citation.chunkId}
                    href={citation.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={citation.sourceTitle}
                    className="max-w-[10rem] truncate rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-600 hover:underline dark:bg-stone-800 dark:text-stone-400"
                  >
                    [{i + 1}] {citation.sourceTitle}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {pendingMessage && (
          <div className="animate-fade-in ml-auto max-w-md rounded-2xl rounded-br-sm bg-stone-900 px-4 py-3 text-sm text-white dark:bg-white dark:text-stone-900">
            <p className="whitespace-pre-wrap">{pendingMessage}</p>
          </div>
        )}
        {sendMessage.isPending && <TypingBubble />}
      </div>

      <form
        className="mt-4 flex items-end gap-2 border-t border-stone-200 pt-4 dark:border-stone-800"
        onSubmit={(e) => {
          e.preventDefault();
          submitDraft();
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitDraft();
            }
          }}
          rows={1}
          placeholder="Ask a question about this platform… (Shift+Enter for a new line)"
          className="max-h-40 w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          type="submit"
          disabled={sendMessage.isPending || !draft.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-600 disabled:opacity-50"
        >
          <Send className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
}
