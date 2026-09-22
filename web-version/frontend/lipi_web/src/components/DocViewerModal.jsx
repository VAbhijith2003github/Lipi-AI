import React from 'react';
import { IconClose } from './Icons';

export const DocViewerModal = ({ doc, onClose }) => {
  if (!doc) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrapper">
            <span className="pdf-tag">PDF</span>
            <h3 className="modal-title">{doc.name}</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close document modal">
            <IconClose size={18} color="#a0a6b5" />
          </button>
        </div>

        <div className="modal-body">
          <div className="pdf-placeholder-preview">
            <div className="preview-page">
              <div className="page-header-line"></div>
              <h4>{doc.name}</h4>
              <p className="preview-text">
                Document preview for Lipi AI. Processing OCR and AI text extraction...
              </p>
              <div className="page-skeleton-lines">
                <div className="sk-line w-90"></div>
                <div className="sk-line w-80"></div>
                <div className="sk-line w-95"></div>
                <div className="sk-line w-70"></div>
                <div className="sk-line w-85"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <span className="doc-meta-footer">{doc.size || 'PDF Document'}</span>
          <button className="btn-primary" onClick={onClose}>Close Viewer</button>
        </div>
      </div>
    </div>
  );
};
