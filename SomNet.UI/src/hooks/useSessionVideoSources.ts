import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSessionVideoTokensSafe, isVideoConfigured } from '@/api/video';
import { withGo2RtcViewerMode, type VideoSourcePair } from '@/config/videoSources';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useFocusSession } from '@/hooks/useFocusSession';
import { useOptions } from '@/context/OptionsProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useFocusDeviceOperationMode } from '@/hooks/useFocusDeviceOperationMode';
import { useDeviceSceneSessionActive } from '@/hooks/useDeviceSceneSessionActive';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useDeviceActuatorKind } from '@/hooks/useDeviceActuatorKind';
import { selectedDeviceAutomaticRunning } from '@/utils/selectedDeviceAutomatic';
import { useVideoDisplay } from '@/context/VideoDisplayProvider';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { consumeManualVideoPendingNotify } from '@/utils/manualVideoCommandNotify';
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
import {
  clearVideoFeedRestoreHint,
  matchesVideoFeedRestoreHint,
  readVideoFeedRestoreHint,
  writeVideoFeedRestoreHint,
} from '@/utils/videoFeedRestoreHint';
import {
  applyLiveVideoFeedPreference,
  areLiveVideoFeedsHidden,
  normalizeLiveVideoFeeds,
} from '@/utils/liveVideoFeedPreference';
import {
  applyVideoFeedBandwidthToPair,
  normalizeVideoFeedBandwidth,
} from '@/utils/videoFeedBandwidth';

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
  const mode = useFocusDeviceOperationMode() ?? 'manual';
  const focusSession = useFocusSession();
  const {
    manualVideoActivitySeq,
    manualVideoRehydrateSeq,
    prepareManualSession,
    prepareAutomaticSession,
  } = useLiveSession();
  const { selectedSub } = useSubTarget();
  const { options, settings, settingsLoaded, isLoading: settingsLoading } = useOptions();
  const { selectedDeviceId } = useSubDevice();
  const { actuatorKind } = useDeviceActuatorKind();
  const { expandForPlaybackStart } = useVideoDisplay();
  const { isCommandPending } = useHardwareCommand();
  const sceneSessionActive = useDeviceSceneSessionActive(selectedDeviceId ?? '');
  const liveVideoFeeds = normalizeLiveVideoFeeds(options.liveVideoFeeds);
  const liveFeedsHidden = areLiveVideoFeedsHidden(liveVideoFeeds);
  const videoFeedBandwidth = normalizeVideoFeedBandwidth(options.videoFeedBandwidth);

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

  const automaticRunning = selectedDeviceAutomaticRunning(
    selectedSub,
    selectedDeviceId,
    actuatorKind,
    settings,
    settingsLoaded,
    settingsLoading,
  );

  const [sources, setSources] = useState<VideoSourcePair>([undefined, undefined]);
  const [feedVisible, setFeedVisible] = useState(false);
  const [previewStarting, setPreviewStarting] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  const hideAtRef = useRef<number | null>(null);
  const hideWatchRef = useRef<number>();
  const postSessionGraceRef = useRef(false);
  const prevSessionIdRef = useRef<string | undefined>();
  const prevSessionModeRef = useRef(focusSession?.mode);
  const prevSessionSubRef = useRef(focusSession?.subTarget);
  const tokensLoadedSessionRef = useRef<string | null>(null);
  const restoredManualRehydrateSeqRef = useRef(0);

  const sessionId = focusSession?.id;
  const sessionMode = focusSession?.mode;
  const sessionSub = focusSession?.subTarget;
  const focusDeviceId = selectedDeviceId ?? '';

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
      if (focusDeviceId) {
        clearVideoFeedRestoreHint(focusDeviceId);
      }
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
    const feedsAlreadyLoaded = Boolean(sources[0] || sources[1]);
    if (
      !isVideoConfigured() ||
      !mode ||
      !sceneSessionActive ||
      (feedVisible && feedsAlreadyLoaded) ||
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
      expandForPlaybackStart();
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
    expandForPlaybackStart,
    sceneSessionActive,
    sources,
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

    if (focusSession?.subTarget === selectedSub) {
      postSessionGraceRef.current = false;

      if (focusSession.mode === 'automatic' && automaticRunning) {
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
    focusSession,
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

    if (!consumeManualVideoPendingNotify()) {
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
    if (
      !feedVisible ||
      !sessionId ||
      !sessionMode ||
      sessionSub !== selectedSub ||
      !focusDeviceId
    ) {
      return;
    }

    writeVideoFeedRestoreHint({
      sessionId,
      subTarget: selectedSub,
      deviceId: focusDeviceId,
      mode: sessionMode,
      preview: previewActive,
    });
  }, [feedVisible, focusDeviceId, previewActive, sessionId, sessionMode, sessionSub, selectedSub]);

  useEffect(() => {
    if (feedVisible || !sessionId || !sessionMode || sessionSub !== selectedSub) {
      return;
    }

    if (!focusDeviceId) {
      return;
    }

    const hint = readVideoFeedRestoreHint(focusDeviceId);
    const hintMatches =
      hint !== null &&
      matchesVideoFeedRestoreHint(hint, sessionId, selectedSub, focusDeviceId, sessionMode);
    const shouldRestoreFromRehydrate =
      sessionMode === 'manual' &&
      manualVideoRehydrateSeq > restoredManualRehydrateSeqRef.current;

    if (!hintMatches && !shouldRestoreFromRehydrate) {
      return;
    }

    if (shouldRestoreFromRehydrate) {
      restoredManualRehydrateSeqRef.current = manualVideoRehydrateSeq;
    }

    const restorePreview = hintMatches ? hint.preview : false;
    setFeedVisible(true);

    if (restorePreview) {
      setPreviewActive(true);
      scheduleHideAfter(`${sessionMode}-preview-restore`, previewTimeoutSeconds);
      return;
    }

    setPreviewActive(false);

    if (sessionMode === 'manual' && manualCommandPending) {
      pauseHideDeadline();
      return;
    }

    if (sessionMode === 'automatic' && (automaticRunning || hintMatches)) {
      pauseHideDeadline();
      return;
    }

    scheduleHideAfter(`${sessionMode}-refresh-restore`);
  }, [
    automaticRunning,
    feedVisible,
    manualCommandPending,
    manualVideoRehydrateSeq,
    pauseHideDeadline,
    previewTimeoutSeconds,
    scheduleHideAfter,
    sessionId,
    sessionMode,
    sessionSub,
    selectedSub,
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
      try {
        const tokens = await fetchSessionVideoTokensSafe(activeSessionId, selectedSub);
        if (cancelled) {
          return;
        }

        if (!tokens) {
          logVideoEvent('[video] token mint failed; resetting feed state');
          hideFeeds('token-mint-failed');
          return;
        }

        tokensLoadedSessionRef.current = activeSessionId;
        setSources(toViewerUrls(tokens));
      } catch (error) {
        if (cancelled) {
          return;
        }

        logVideoEvent('[video] token mint error; resetting feed state', {
          message: error instanceof Error ? error.message : String(error),
        });
        hideFeeds('token-mint-failed');
      }
    }

    void loadTokens();

    return () => {
      cancelled = true;
    };
  }, [feedVisible, hideFeeds, sessionId, sessionSub, selectedSub]);

  useEffect(() => {
    tokensLoadedSessionRef.current = null;
  }, [videoFeedBandwidth]);

  useEffect(
    () => () => {
      stopHideWatch();
    },
    [stopHideWatch],
  );

  const bandwidthSources = useMemo(
    () => applyVideoFeedBandwidthToPair(sources, videoFeedBandwidth),
    [sources, videoFeedBandwidth],
  );

  const filteredSources = useMemo(
    () => applyLiveVideoFeedPreference(bandwidthSources, liveVideoFeeds),
    [bandwidthSources, liveVideoFeeds],
  );

  useEffect(() => {
    if (liveFeedsHidden && feedVisible) {
      hideFeeds('live-feeds-disabled');
    }
  }, [feedVisible, hideFeeds, liveFeedsHidden]);

  const hasLoadedSources = Boolean(filteredSources[0] || filteredSources[1]);

  const videoPreview = useMemo(
    (): VideoPreviewControls => ({
      available: mode !== null && isVideoConfigured() && !liveFeedsHidden,
      canStart:
        sceneSessionActive &&
        (!feedVisible || !hasLoadedSources) &&
        !previewStarting &&
        !commandPending &&
        !(mode === 'automatic' && automaticRunning),
      starting: previewStarting,
      feedsActive: feedVisible && hasLoadedSources,
      previewActive,
      previewTimeoutSeconds,
      start: startPreview,
    }),
    [
    automaticRunning,
    commandPending,
    feedVisible,
    hasLoadedSources,
    mode,
    previewActive,
    previewStarting,
    previewTimeoutSeconds,
    liveFeedsHidden,
    sceneSessionActive,
    startPreview,
  ],
  );

  return { sources: filteredSources, videoPreview };
}
