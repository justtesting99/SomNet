import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSessionVideoTokensSafe, isVideoConfigured } from '@/api/video';
import { withGo2RtcViewerMode, type VideoSourcePair } from '@/config/videoSources';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useMode } from '@/context/ModeProvider';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { consumeManualVideoCommandComplete } from '@/utils/manualVideoCommandNotify';
import { logVideoEvent } from '@/utils/videoDebug';
import {
  clampVideoFeedTimeoutSeconds,
  computeManualPreviewTimeoutSeconds,
} from '@/utils/videoFeedTimeout';
import {
  computeFeedHideDeadlineMs,
  FEED_HIDE_CHECK_INTERVAL_MS,
  shouldHideFeedsAt,
} from '@/utils/videoFeedVisibility';

function toViewerUrls(response: { front: { url: string }; rear: { url: string } }): VideoSourcePair {
  return [
    withGo2RtcViewerMode(response.front.url),
    withGo2RtcViewerMode(response.rear.url),
  ];
}

export interface VideoPreviewControls {
  available: boolean;
  canStart: boolean;
  starting: boolean;
  feedsActive: boolean;
  /** True while preview timeout is active (not stroke/session feeds). */
  previewActive: boolean;
  previewTimeoutSeconds: number;
  start: () => Promise<void>;
}

export interface SessionVideoSourcesResult {
  sources: VideoSourcePair;
  videoPreview: VideoPreviewControls;
}

/** Session-scoped video URLs (Phase 3) with idle / post-session timeout (V3-D6). */
export function useSessionVideoSources(): SessionVideoSourcesResult {
  const { mode } = useMode();
  const {
    activeSession,
    manualVideoActivitySeq,
    prepareManualSession,
    prepareAutomaticSession,
  } = useLiveSession();
  const { selectedSub } = useSubTarget();
  const { options, settings } = useOptions();
  const { isCommandPending } = useHardwareCommand();

  const timeoutSeconds = clampVideoFeedTimeoutSeconds(options.videoFeedTimeoutSeconds);
  const previewTimeoutSeconds = computeManualPreviewTimeoutSeconds(timeoutSeconds);
  const timeoutMsRef = useRef(timeoutSeconds * 1000);
  timeoutMsRef.current = timeoutSeconds * 1000;

  const manualCommandPending =
    isCommandPending(HARDWARE_COMMAND_KEYS.manualStroke) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.manualBurst);

  const automaticCommandPending =
    isCommandPending(HARDWARE_COMMAND_KEYS.automaticStart) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.automaticStop) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.automaticUpdate);

  const commandPending =
    mode === 'manual' ? manualCommandPending : automaticCommandPending;

  const automaticRunning = settings.automatic.running;

  const [sources, setSources] = useState<VideoSourcePair>([undefined, undefined]);
  const [feedVisible, setFeedVisible] = useState(false);
  const [previewStarting, setPreviewStarting] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  const hideAtRef = useRef<number | null>(null);
  const hideWatchRef = useRef<number>();
  const postSessionGraceRef = useRef(false);
  const prevSessionIdRef = useRef<string | undefined>();
  const prevSessionModeRef = useRef(activeSession?.mode);
  const prevSessionSubRef = useRef(activeSession?.subTarget);
  const tokensLoadedSessionRef = useRef<string | null>(null);

  const sessionId = activeSession?.id;
  const sessionMode = activeSession?.mode;
  const sessionSub = activeSession?.subTarget;

  const stopHideWatch = useCallback(() => {
    if (hideWatchRef.current !== undefined) {
      window.clearInterval(hideWatchRef.current);
      hideWatchRef.current = undefined;
    }
  }, []);

  const hideFeeds = useCallback(
    (reason: string) => {
      logVideoEvent('[video] hide feeds', { reason, at: new Date().toISOString() });

      hideAtRef.current = null;
      stopHideWatch();
      postSessionGraceRef.current = false;
      tokensLoadedSessionRef.current = null;
      setPreviewActive(false);
      setFeedVisible(false);
      setSources([undefined, undefined]);
    },
    [stopHideWatch],
  );

  const ensureHideWatch = useCallback(() => {
    if (hideWatchRef.current !== undefined) {
      return;
    }

    hideWatchRef.current = window.setInterval(() => {
      if (shouldHideFeedsAt(Date.now(), hideAtRef.current)) {
        hideFeeds('deadline');
      }
    }, FEED_HIDE_CHECK_INTERVAL_MS);
  }, [hideFeeds]);

  const scheduleHideAfter = useCallback(
    (reason: string, timeoutOverrideSeconds?: number) => {
      const timeoutSecondsForHide =
        timeoutOverrideSeconds ?? timeoutMsRef.current / 1000;
      hideAtRef.current = computeFeedHideDeadlineMs(Date.now(), timeoutSecondsForHide);
      ensureHideWatch();

      logVideoEvent('[video] schedule hide', {
        reason,
        now: new Date().toISOString(),
        hideAt: new Date(hideAtRef.current).toISOString(),
        timeoutSeconds: timeoutSecondsForHide,
      });
    },
    [ensureHideWatch],
  );

  const startPreview = useCallback(async () => {
    if (
      !isVideoConfigured() ||
      !mode ||
      feedVisible ||
      previewStarting ||
      commandPending ||
      (mode === 'automatic' && automaticRunning)
    ) {
      return;
    }

    setPreviewStarting(true);
    try {
      if (mode === 'manual') {
        await prepareManualSession();
      } else {
        await prepareAutomaticSession();
      }

      setFeedVisible(true);
      setPreviewActive(true);
      scheduleHideAfter(`${mode}-preview`, previewTimeoutSeconds);
    } finally {
      setPreviewStarting(false);
    }
  }, [
    automaticRunning,
    commandPending,
    feedVisible,
    mode,
    prepareAutomaticSession,
    prepareManualSession,
    previewStarting,
    previewTimeoutSeconds,
    scheduleHideAfter,
  ]);

  const pauseHideDeadline = useCallback(() => {
    hideAtRef.current = null;
  }, []);

  useEffect(() => {
    const prevSessionId = prevSessionIdRef.current;
    const prevSessionMode = prevSessionModeRef.current;
    const prevSessionSub = prevSessionSubRef.current;

    prevSessionIdRef.current = sessionId;
    prevSessionModeRef.current = sessionMode;
    prevSessionSubRef.current = sessionSub;

    if (activeSession?.subTarget === selectedSub) {
      postSessionGraceRef.current = false;

      if (activeSession.mode === 'automatic' && automaticRunning) {
        setPreviewActive(false);
        setFeedVisible(true);
        pauseHideDeadline();
      }

      return;
    }

    if (
      !sessionId &&
      prevSessionMode === 'automatic' &&
      prevSessionSub === selectedSub &&
      prevSessionId
    ) {
      postSessionGraceRef.current = true;
      setFeedVisible(true);
      scheduleHideAfter('automatic-post-session');
      return;
    }

    if (postSessionGraceRef.current) {
      return;
    }

    if (sessionId !== prevSessionId || sessionSub !== prevSessionSub) {
      hideFeeds('session-transition');
    }
  }, [
    activeSession,
    automaticRunning,
    sessionId,
    sessionMode,
    sessionSub,
    selectedSub,
    hideFeeds,
    pauseHideDeadline,
    scheduleHideAfter,
  ]);

  useEffect(() => {
    if (sessionMode !== 'manual' || sessionSub !== selectedSub) {
      return;
    }

    if (manualCommandPending) {
      pauseHideDeadline();
      setFeedVisible(true);
      return;
    }

    if (!consumeManualVideoCommandComplete()) {
      return;
    }

    setPreviewActive(false);
    setFeedVisible(true);
    scheduleHideAfter('manual-command-complete');
  }, [
    manualCommandPending,
    sessionMode,
    sessionSub,
    selectedSub,
    manualVideoActivitySeq,
    pauseHideDeadline,
    scheduleHideAfter,
  ]);

  useEffect(() => {
    if (postSessionGraceRef.current) {
      return;
    }

    const sessionActive = Boolean(sessionId && sessionSub === selectedSub);
    if (!feedVisible || !sessionActive || !sessionId) {
      return;
    }

    if (tokensLoadedSessionRef.current === sessionId) {
      return;
    }

    const activeSessionId = sessionId;
    let cancelled = false;

    async function loadTokens() {
      const tokens = await fetchSessionVideoTokensSafe(activeSessionId, selectedSub);
      if (cancelled) {
        return;
      }

      if (!tokens) {
        logVideoEvent('[video] token mint failed; keeping prior sources if any');
        return;
      }

      tokensLoadedSessionRef.current = activeSessionId;
      setSources(toViewerUrls(tokens));
    }

    void loadTokens();

    return () => {
      cancelled = true;
    };
  }, [feedVisible, sessionId, sessionSub, selectedSub]);

  useEffect(
    () => () => {
      stopHideWatch();
    },
    [stopHideWatch],
  );

  const videoPreview = useMemo(
    (): VideoPreviewControls => ({
      available: mode !== null && isVideoConfigured(),
      canStart:
        !feedVisible &&
        !previewStarting &&
        !commandPending &&
        !(mode === 'automatic' && automaticRunning),
      starting: previewStarting,
      feedsActive: feedVisible && Boolean(sources[0] || sources[1]),
      previewActive,
      previewTimeoutSeconds,
      start: startPreview,
    }),
    [
      automaticRunning,
      commandPending,
      feedVisible,
      mode,
      previewActive,
      previewStarting,
      previewTimeoutSeconds,
      sources,
      startPreview,
    ],
  );

  return { sources, videoPreview };
}
