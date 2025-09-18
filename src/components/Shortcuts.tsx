"use client";

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Shortcuts: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K -> open settings
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/settings");
        return;
      }

      // '/' -> focus relay-host input (unless user is typing in an input)
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            (active as HTMLElement).isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        const el = document.getElementById("relay-host") as HTMLElement | null;
        if (el) {
          el.focus();
        } else {
          // navigate to settings then focus after a short delay
          navigate("/settings");
          setTimeout(() => {
            const el2 = document.getElementById("relay-host") as HTMLElement | null;
            if (el2) el2.focus();
          }, 250);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return null;
};

export default Shortcuts;