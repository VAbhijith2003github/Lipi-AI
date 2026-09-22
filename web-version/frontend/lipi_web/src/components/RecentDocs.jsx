import React from 'react';
import { IconPdfItem, IconExternalLink, IconTrash } from './Icons';

export const RecentDocs = ({ documents, onOpenDoc, onDeleteDoc }) => {
  if (!documents || documents.length === 0) return null;

  return (
    <div className="recent-docs-section">
      <h3 className="recent-heading">RECENTLY ACCESSED</h3>
      <div className="recent-list">
        {documents.map((doc) => (
          <div key={doc.id} className="recent-card" onClick={() => onOpenDoc(doc)}>
            <div className="recent-card-left">
              <div className="recent-icon-box">
                <IconPdfItem size={22} color="#ff3b30" />
              </div>
              <div className="recent-info">
                <h4 className="recent-title">{doc.name}</h4>
                <p className="recent-meta">{doc.size} · {doc.date}</p>
              </div>
            </div>

            <div className="recent-card-actions" onClick={(e) => e.stopPropagation()}>
              <button 
                className="action-icon-btn" 
                title="Open Document"
                onClick={() => onOpenDoc(doc)}
                aria-label="Open Document"
              >
                <IconExternalLink size={16} color="#8a90a0" />
              </button>
              {onDeleteDoc && (
                <button 
                  className="action-icon-btn delete-btn" 
                  title="Remove from recents"
                  onClick={() => onDeleteDoc(doc.id)}
                  aria-label="Delete Document"
                >
                  <IconTrash size={16} color="#8a90a0" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
