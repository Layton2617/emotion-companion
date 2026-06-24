"use client";

import type { UserProfile } from "@emotion/core";

// 情绪近况是最敏感的呈现:绝不诊断、绝不下定论,只是"我感觉到你最近…"。
// 调研里"克制陪伴"要求这里不放大焦虑,所以措辞一律是陪伴口吻而非评估口吻。
const EMOTION_TONE: Record<string, { emoji: string; tint: string }> = {
  孤独: { emoji: "🌙", tint: "from-indigo-50 to-slate-50" },
  焦虑: { emoji: "🌫️", tint: "from-teal-50 to-slate-50" },
  被忽视: { emoji: "🍂", tint: "from-stone-50 to-slate-50" },
  期待: { emoji: "🌱", tint: "from-emerald-50 to-slate-50" },
  低落: { emoji: "☁️", tint: "from-blue-50 to-slate-50" },
  平静: { emoji: "🫖", tint: "from-amber-50 to-slate-50" },
};

const DEFAULT_TONE = { emoji: "🤍", tint: "from-rose-50 to-slate-50" };

export interface ProfileSummaryProps {
  profile: UserProfile;
}

export function ProfileSummary({ profile }: ProfileSummaryProps) {
  const tone = (profile.currentEmotion && EMOTION_TONE[profile.currentEmotion]) || DEFAULT_TONE;

  return (
    <section
      className={`rounded-3xl bg-gradient-to-br ${tone.tint} p-5`}
      aria-label="情绪近况"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="select-none text-2xl leading-none">
          {tone.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            我感觉到的你
          </p>
          <p className="mt-1 text-[15px] leading-relaxed text-neutral-700">
            {profile.summary || "我们还在慢慢认识彼此,我会一点点记住你。"}
          </p>

          {profile.currentEmotion && (
            <p className="mt-2 text-sm text-neutral-500">
              最近你好像有点{profile.currentEmotion}，我在的。
            </p>
          )}
        </div>
      </div>

      {profile.openThreads.length > 0 && (
        <div className="mt-4 border-t border-white/60 pt-3">
          <p className="text-[11px] text-neutral-400">还想着陪你聊聊的</p>
          <ul className="mt-1.5 space-y-1">
            {profile.openThreads.map((thread, i) => (
              <li
                key={`${i}-${thread}`}
                className="text-sm text-neutral-600 before:mr-1.5 before:text-neutral-300 before:content-['—']"
              >
                {thread}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
