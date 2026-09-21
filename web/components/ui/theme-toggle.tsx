"use client";

import React, { useState, useSyncExternalStore } from "react";
import { Button } from "./button";
import { Moon, Sun } from "lucide-react";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    if (next === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
    setTheme(next);
  };

  if (!isClient) {
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label="Toggle theme"
        title="Toggle theme"
        disabled
      >
        <Sun className="h-4 w-4 text-[var(--foreground)]" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-[var(--foreground)]" />
      ) : (
        <Moon className="h-4 w-4 text-[var(--foreground)]" />
      )}
    </Button>
  );
}
