"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildLiveDisplay, type LiveDisplayText, type LiveDisplayView } from "@/lib/assessmentRun";
import type { CockpitFailure, PatientControl } from "@/lib/cockpit";
import { serverOffsetMs } from "@/lib/companionScreen";
import { createLatestWins, type LatestWins } from "@/lib/latestWins";
import type { SessionProtocol } from "@/lib/sessionProtocols";
import { postDisplay } from "@/components/therapist/assessment/api";
import type { PreviewStatus } from "@/components/therapist/assessment/PatientPreview";

type DisplayRequest = { stepId: string; control: PatientControl };

/**
 * What the cockpit tells the patient's screen. A step open, Get ready, Go,
 * Done, Rest or a clock start goes to the display route as a phase and
 * whether the clock starts (never words); taps in quick succession collapse to
 * the last one and only one request is ever in flight. The preview shows the
 * same words at once (the pure builder the server uses), then the server's
 * own answer when it arrives; the offset it returns lets the preview's mini
 * clock agree with the patient's.
 */
export function useDisplaySender(input: {
  runId: string;
  protocol: SessionProtocol;
  startingText: LiveDisplayText;
  onFailure: (failure: CockpitFailure) => void;
}) {
  const { runId, protocol } = input;
  const [view, setView] = useState<LiveDisplayView | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [activeControl, setActiveControl] = useState<string | null>("ready");
  const [text, setText] = useState<LiveDisplayText>(input.startingText);
  const lastRequest = useRef<DisplayRequest | null>(null);
  const senderRef = useRef<LatestWins<DisplayRequest> | null>(null);
  const failureRef = useRef(input.onFailure);
  useEffect(() => {
    failureRef.current = input.onFailure;
  });

  useEffect(() => {
    const sender = createLatestWins<DisplayRequest>(async (req) => {
      const result = await postDisplay({ runId, stepId: req.stepId, phase: req.control.phase, startClock: req.control.startClock });
      if (result.ok) {
        setView(result.data.display);
        setOffsetMs(serverOffsetMs(result.data.serverNow, Date.now()));
        setStatus("live");
      } else {
        setStatus("failed");
        failureRef.current(result.failure);
      }
    }, 250);
    senderRef.current = sender;
    return () => {
      sender.cancel();
      senderRef.current = null;
    };
  }, [runId]);

  const push = useCallback(
    (stepId: string, control: PatientControl, immediate = false) => {
      const target = protocol.steps.find((s) => s.id === stepId);
      if (!target) return;
      const built = buildLiveDisplay({ protocol, step: target, phase: control.phase, startClock: control.startClock });
      if (built.ok) setText(built.write.display);
      setActiveControl(control.key);
      setStatus("sending");
      const req = { stepId, control };
      lastRequest.current = req;
      senderRef.current?.push(req);
      if (immediate) senderRef.current?.flush();
    },
    [protocol]
  );

  const retry = useCallback(() => {
    const req = lastRequest.current;
    if (req) push(req.stepId, req.control, true);
  }, [push]);

  return { view, offsetMs, status, activeControl, text, push, retry };
}
