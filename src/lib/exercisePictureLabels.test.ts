import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { EXERCISE_LIBRARY, EXERCISE_PICTURES } from "@/lib/exerciseLibrary";
import { containsClinicWord } from "@/lib/sessionProtocols";
import { EXERCISE_PICTURE_LABELS, exercisePictureAlt, exercisePictureLabel } from "@/lib/exercisePictureLabels";
import ExercisePicture from "@/components/exercises/ExercisePicture";

describe("exercise picture labels", () => {
  it("has words for every picture the library names, and for nothing else", () => {
    expect(Object.keys(EXERCISE_PICTURE_LABELS).sort()).toEqual([...EXERCISE_PICTURES].sort());
    expect(EXERCISE_PICTURES).toHaveLength(36);
  });

  it("keeps each label short, plain and patient-safe", () => {
    for (const [key, label] of Object.entries(EXERCISE_PICTURE_LABELS)) {
      expect(label.length, key).toBeGreaterThan(10);
      expect(label.length, key).toBeLessThanOrEqual(90);
      expect(containsClinicWord(label), key).toBeNull();
    }
  });

  it("has every library exercise's picture labelled", () => {
    for (const e of EXERCISE_LIBRARY) expect(EXERCISE_PICTURE_LABELS[e.picture], e.key).toBeTruthy();
  });

  it("leads the accessible name with the exercise name, and falls back for an unknown key", () => {
    expect(exercisePictureAlt("bridge", "Bottom lift")).toBe("Bottom lift: lying on the back with knees bent, lifting the bottom");
    expect(exercisePictureAlt("bridge")).toBe(EXERCISE_PICTURE_LABELS.bridge);
    expect(exercisePictureLabel("not_a_picture")).toBe("An exercise");
  });
});

describe("ExercisePicture", () => {
  it("draws every picture as a labelled image with something in it", () => {
    for (const key of EXERCISE_PICTURES) {
      const html = renderToStaticMarkup(createElement(ExercisePicture, { picture: key, name: "Name" }));
      expect(html, key).toContain('role="img"');
      expect(html, key).toContain(`aria-label="Name: `);
      expect(html, key).toContain(`data-picture="${key}"`);
      expect((html.match(/<circle/g) ?? []).length, key).toBeGreaterThanOrEqual(1);
    }
  });

  it("draws a neutral figure for an unknown key", () => {
    const html = renderToStaticMarkup(createElement(ExercisePicture, { picture: "mystery" }));
    expect(html).toContain('aria-label="An exercise"');
    expect(html).toContain("<circle");
  });

  it("takes its colours from the tone", () => {
    expect(renderToStaticMarkup(createElement(ExercisePicture, { picture: "bridge", tone: "dark" }))).toContain("#5eead4");
    expect(renderToStaticMarkup(createElement(ExercisePicture, { picture: "bridge", tone: "light" }))).toContain("#0f766e");
  });
});
