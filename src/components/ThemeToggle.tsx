"use client";

import React from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const toggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <Button variant="ghost" onClick={toggle} aria-label="Toggle theme">
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </Button>
  );
};

export default ThemeToggle;