import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// QA F-20: the admin dashboard read every therapist's weekly template with a
// bare `.select()`, which PostgREST stops at 1,000 rows -- about eight
// therapists' full weeks. The rows past the cap are the most recently saved
// schedules, so a therapist who had just been given hours kept reading "Has
// not filled in a working schedule yet". A read of the template that is not
// narrowed to one therapist must go through readAllRows*.

const SRC = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("whole-clinic roster reads are paged", () => {
  it("every therapist_availability_template read is one therapist's, or goes through readAllRows", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes('.from("therapist_availability_template")')) return;
        // The statement this read belongs to: a few lines either side is
        // enough for every call shape in this codebase.
        const before = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
        const after = lines.slice(i, i + 6).join("\n");
        const oneTherapist = /\.eq\("therapist_id"/.test(after);
        const paged = /readAllRows(AsData|ByIds)?\(/.test(before);
        const write = /\.(insert|delete|upsert|update)\(/.test(after);
        if (!oneTherapist && !paged && !write) {
          offenders.push(`${path.relative(SRC, file)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
