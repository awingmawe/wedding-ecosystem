'use client';

import { useState, useCallback } from 'react';
import { SectionWrapper } from './section-wrapper';

interface GiftAccount {
  bank?: string;
  account_number?: string;
  account_name?: string;
}

interface GiftContent {
  accounts?: GiftAccount[];
  description?: string;
}

interface GiftSectionProps {
  content: GiftContent;
  sortOrder: number;
}

function AccountCard({ account }: { account: GiftAccount }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (account.account_number) {
      navigator.clipboard.writeText(account.account_number).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [account.account_number]);

  return (
    <div className="rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-background)] p-4 text-center shadow-sm">
      {account.bank && (
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text)]/60">
          {account.bank}
        </p>
      )}
      {account.account_number && (
        <p className="mt-2 font-mono text-lg font-semibold text-[var(--color-text)]">
          {account.account_number}
        </p>
      )}
      {account.account_name && (
        <p className="mt-1 text-sm text-[var(--color-text)]/70">
          a.n. {account.account_name}
        </p>
      )}
      <button
        onClick={handleCopy}
        className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/10 px-4 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20"
      >
        {copied ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Tersalin
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            Salin
          </>
        )}
      </button>
    </div>
  );
}

export function GiftSection({ content, sortOrder }: GiftSectionProps) {
  const accounts = content.accounts || [];

  return (
    <SectionWrapper sectionType="gift" sortOrder={sortOrder}>
      <h2 className="mb-4 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Kado Digital
      </h2>

      {content.description && (
        <p className="mb-6 text-center text-sm leading-relaxed text-[var(--color-text)]/80">
          {content.description}
        </p>
      )}

      <div className="space-y-3">
        {accounts.map((account, index) => (
          <AccountCard key={index} account={account} />
        ))}
      </div>
    </SectionWrapper>
  );
}
