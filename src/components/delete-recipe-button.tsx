"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function DeleteRecipeButton({ id, title }: { id: number; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Delete “${title}”? This also removes its cook log.`)) return;
    setBusy(true);
    try {
      await api(`/api/v1/recipes/${id}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } catch (err) {
      setBusy(false);
      window.alert(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <Button variant="danger" size="sm" onClick={onDelete} disabled={busy}>
      {busy ? "Deleting…" : "Delete"}
    </Button>
  );
}
