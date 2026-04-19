/**
 * バージョン表示バッジ
 * 全画面の右下に固定表示。クリックで詳細表示。
 * 
 * 表示内容: v{version} ({buildDate} · {gitSha})
 */

'use client';

import { useState } from 'react';
import { VERSION, BUILD_DATE, GIT_SHA, CHANGELOG } from '@/version';

export default function VersionBadge() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="バージョン情報"
        style={{
          position: 'fixed',
          right: '8px',
          bottom: '8px',
          zIndex: 9999,
          padding: '4px 10px',
          fontSize: '11px',
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
          color: '#666',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          border: '1px solid #ddd',
          borderRadius: '12px',
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'all 0.15s ease',
          opacity: 0.7,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.color = '#222';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.7';
          e.currentTarget.style.color = '#666';
        }}
      >
        v{VERSION}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="バージョン詳細"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '520px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '20px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '13px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>バージョン情報</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '20px',
                  color: '#999',
                  padding: '0 8px',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '6px', fontFamily: 'ui-monospace, monospace' }}>
              <div><strong>バージョン:</strong> v{VERSION}</div>
              <div><strong>ビルド日時:</strong> {BUILD_DATE}</div>
              <div><strong>コミット:</strong> {GIT_SHA}</div>
            </div>

            <div>
              <h4 style={{ fontSize: '13px', marginBottom: '8px' }}>更新履歴</h4>
              <ul style={{ paddingLeft: '20px', margin: 0, lineHeight: 1.6 }}>
                {CHANGELOG.map((entry) => (
                  <li key={entry.version}>
                    <strong>v{entry.version}</strong> <span style={{ color: '#999' }}>({entry.date})</span>
                    <ul style={{ paddingLeft: '16px', marginTop: '2px', color: '#444' }}>
                      {entry.changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
