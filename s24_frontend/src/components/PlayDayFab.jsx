import React, { useState } from 'react';
import { Play, X } from 'lucide-react';
import TimelineController from './TimelineController';

// UI-ONLY floating PlayDay button (bottom-right). Opens the unchanged
// TimelineController in a popover; hour/play state flows through existing App
// state, so homepage, DriveEV, and Disaster pages all update live.
export default function PlayDayFab(props) {
  const { currentHour } = props;
  const [open, setOpen] = useState(false);
  const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;

  return (
    <div className="st-playday-fab-wrap">
      {open && (
        <div className="st-playday-pop">
          <div className="st-playday-pop-head">
            <span>PlayDay timeline</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close timeline">
              <X size={15} />
            </button>
          </div>
          <TimelineController {...props} />
        </div>
      )}
      <button
        type="button"
        className="st-playday-fab"
        onClick={() => setOpen((v) => !v)}
        title="Open PlayDay timeline — press Play inside and all pages update live"
      >
        <Play size={18} />
        <span className="st-playday-fab-hour">{formatHour(currentHour)}</span>
      </button>
    </div>
  );
}
