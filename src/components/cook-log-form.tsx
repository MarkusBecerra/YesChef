"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RatingInput } from "@/components/rating";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import type { ValidationDetails } from "@/lib/validate";

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CookLogForm({ recipeId }: { recipeId: number }) {
  const router = useRouter();
  const [cookedOn, setCookedOn] = useState(todayLocal);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<ValidationDetails | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors(null);
    setFormError(null);
    try {
      await api(`/api/v1/recipes/${recipeId}/cooks`, {
        method: "POST",
        body: JSON.stringify({ cookedOn, rating, notes }),
      });
      router.push(`/recipes/${recipeId}`);
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 400 && err.details) setErrors(err.details as ValidationDetails);
      setFormError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {formError && (
        <p role="alert" className="rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}
      <Field label="When" htmlFor="cookedOn" error={errors?.fieldErrors.cookedOn?.[0]}>
        <Input id="cookedOn" type="date" value={cookedOn} max={todayLocal()} onChange={(e) => setCookedOn(e.target.value)} required />
      </Field>
      <Field label="How did it go?" hint="Optional." error={errors?.fieldErrors.rating?.[0]}>
        <RatingInput value={rating} onChange={setRating} />
      </Field>
      <Field label="Notes" htmlFor="notes" hint="What worked, what to change next time." error={errors?.fieldErrors.notes?.[0]}>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Too much salt. Try 20 min instead of 25."
          autoFocus
        />
      </Field>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()} disabled={busy} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={busy} className="flex-[2]">
          {busy ? "Saving…" : "Save cook"}
        </Button>
      </div>
    </form>
  );
}
