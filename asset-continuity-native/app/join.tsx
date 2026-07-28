import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  House,
  IdentificationCard,
  ShieldCheck
} from "phosphor-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  AuthStatusRow,
  TextAction
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import { useCoreJourneyCopy } from "@/i18n/coreJourneyCopy";
import {
  formatInvitationExpiry,
  useInviteCopy
} from "@/i18n/inviteCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing } from "@/theme/tokens";
import type {
  HouseholdInviteReview,
  HouseholdMembership
} from "@alyr/contracts";

type PendingAction = "staging" | "reviewing" | "accepting" | "switching";
type FailedAction = "staging" | "review" | "accept";

export default function JoinHouseholdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();
  const {
    acceptPendingHouseholdInvite,
    bootstrapState,
    busy,
    clearError,
    deferPendingHouseholdInvite,
    discardPendingHouseholdInvite,
    error,
    mode,
    pendingHouseholdInvite,
    pendingHouseholdInviteReview,
    reviewPendingHouseholdInvite,
    session,
    signOut,
    stageHouseholdInvite
  } = useAuthFlow();
  const copy = useInviteCopy();
  const { language } = useCoreJourneyCopy();
  const { startWorkspace, workspace } = useWorkspace();
  const rawCode = Array.isArray(params.code)
    ? params.code[0]
    : params.code;
  const stagedCode = useRef<string | null>(null);
  const retryBearer = useRef<string | null>(null);
  const reviewedInviteKey = useRef<string | null>(null);
  const [pendingAction, setPendingAction] =
    useState<PendingAction | null>(null);
  const [failedAction, setFailedAction] =
    useState<FailedAction | null>(null);
  const [receipt, setReceipt] =
    useState<HouseholdMembership | null>(null);
  const [acceptedReview, setAcceptedReview] =
    useState<HouseholdInviteReview | null>(null);

  const protectInvitation = useCallback(
    async (oneTimeCode: string) => {
      if (pendingAction === "staging") return;
      retryBearer.current = oneTimeCode;
      setPendingAction("staging");
      setFailedAction(null);
      clearError();
      try {
        const stored = await stageHouseholdInvite(oneTimeCode);
        if (!stored) {
          setFailedAction("staging");
          return;
        }
        // Remove the bearer from visible route state as soon as its encrypted,
        // device-bound copy is durable.
        retryBearer.current = null;
        router.replace(AUTH_ROUTES.join);
      } finally {
        setPendingAction(null);
      }
    },
    [clearError, pendingAction, router, stageHouseholdInvite]
  );

  const reviewInvitation = useCallback(async () => {
    if (pendingAction === "reviewing") return;
    setPendingAction("reviewing");
    setFailedAction(null);
    clearError();
    try {
      const review = await reviewPendingHouseholdInvite();
      if (!review) {
        setFailedAction("review");
      }
    } finally {
      setPendingAction(null);
    }
  }, [
    clearError,
    pendingAction,
    reviewPendingHouseholdInvite
  ]);

  const acceptInvitation = useCallback(async () => {
    if (
      pendingAction === "accepting" ||
      !pendingHouseholdInviteReview
    ) {
      return;
    }
    setPendingAction("accepting");
    setFailedAction(null);
    clearError();
    try {
      const membership = await acceptPendingHouseholdInvite();
      if (!membership) {
        setFailedAction("accept");
        return;
      }
      if (mode === "preview" && !workspace) {
        await startWorkspace("sample");
      }
      setAcceptedReview(pendingHouseholdInviteReview);
      setReceipt(membership);
    } finally {
      setPendingAction(null);
    }
  }, [
    acceptPendingHouseholdInvite,
    clearError,
    mode,
    pendingAction,
    pendingHouseholdInviteReview,
    startWorkspace,
    workspace
  ]);

  useEffect(() => {
    if (!rawCode || stagedCode.current === rawCode) return;
    stagedCode.current = rawCode;
    void protectInvitation(rawCode);
  }, [protectInvitation, rawCode]);

  useEffect(() => {
    if (
      bootstrapState !== "ready" ||
      !session ||
      !pendingHouseholdInvite ||
      pendingHouseholdInviteReview ||
      error ||
      receipt
    ) {
      return;
    }
    const reviewKey =
      `${session.identity.id}:${pendingHouseholdInvite.capturedAt}`;
    if (reviewedInviteKey.current === reviewKey) return;
    reviewedInviteKey.current = reviewKey;
    void reviewInvitation();
  }, [
    bootstrapState,
    error,
    pendingHouseholdInvite,
    pendingHouseholdInviteReview,
    receipt,
    reviewInvitation,
    session
  ]);

  const closeInvitation = async () => {
    if (!receipt) {
      await discardPendingHouseholdInvite();
    }
    clearError();
    router.replace(session ? "/" : AUTH_ROUTES.welcome);
  };

  const deferInvitation = () => {
    deferPendingHouseholdInvite();
    router.replace(
      session?.onboarding === "complete"
        ? "/"
        : AUTH_ROUTES.household
    );
  };

  const useAnotherAccount = async () => {
    const oneTimeCode = pendingHouseholdInvite?.oneTimeCode;
    if (!oneTimeCode || pendingAction === "switching") return;
    setPendingAction("switching");
    setFailedAction(null);
    clearError();
    try {
      retryBearer.current = oneTimeCode;
      const signedOut = await signOut();
      if (!signedOut) return;
      const restored = await stageHouseholdInvite(oneTimeCode);
      if (!restored) {
        setFailedAction("staging");
        return;
      }
      retryBearer.current = null;
      router.replace(AUTH_ROUTES.signIn);
    } finally {
      setPendingAction(null);
    }
  };

  const review = receipt
    ? acceptedReview
    : pendingHouseholdInviteReview;
  const roleLabel =
    review?.role === "editor"
      ? copy.screen.editor
      : copy.screen.viewer;
  const roleDetail =
    review?.role === "editor"
      ? copy.screen.editorDescription
      : copy.screen.viewerDescription;
  const expiresAt = review
    ? formatInvitationExpiry(review.expiresAt, language)
    : "";
  const isStaging =
    pendingAction === "staging" ||
    bootstrapState === "bootstrapping" ||
    Boolean(rawCode && !pendingHouseholdInvite && !error);
  const isReviewing =
    pendingAction === "reviewing" ||
    Boolean(
      session &&
        pendingHouseholdInvite &&
        !pendingHouseholdInviteReview &&
        !error &&
        !receipt
    );
  const isAccepting = pendingAction === "accepting";
  const isSwitching = pendingAction === "switching";
  const loading =
    isStaging || isReviewing || isAccepting || isSwitching;
  const retryableFailure = Boolean(error?.retryable && failedAction);
  const invalid =
    bootstrapState === "ready" &&
    !loading &&
    !receipt &&
    (!pendingHouseholdInvite || Boolean(error && !retryableFailure));
  const signedOutReady =
    !loading &&
    !error &&
    !receipt &&
    Boolean(pendingHouseholdInvite && !session);
  const reviewReady =
    !loading &&
    !error &&
    !receipt &&
    Boolean(session && pendingHouseholdInvite && review);

  const retry = () => {
    if (failedAction === "accept") {
      void acceptInvitation();
      return;
    }
    if (failedAction === "review") {
      reviewedInviteKey.current = null;
      void reviewInvitation();
      return;
    }
    const oneTimeCode = rawCode ?? retryBearer.current;
    if (oneTimeCode) {
      void protectInvitation(oneTimeCode);
    }
  };

  const footer = receipt ? (
    <AuthActions
      primary={{
        label: copy.joinLink.receiptAction,
        icon: ArrowRight,
        onPress: () => router.replace("/")
      }}
    />
  ) : retryableFailure ? (
    <AuthActions
      primary={{
        label: copy.joinLink.retryAction,
        icon: ArrowRight,
        disabled: busy,
        onPress: retry
      }}
      secondary={{
        label:
          failedAction === "staging"
            ? copy.joinLink.cancelAction
            : copy.joinLink.notNowAction,
        disabled: busy,
        onPress: () => {
          if (failedAction === "staging") {
            void closeInvitation();
          } else {
            deferInvitation();
          }
        }
      }}
    />
  ) : invalid ? (
    <AuthActions
      primary={{
        label: copy.joinLink.cancelAction,
        icon: ArrowLeft,
        onPress: () => void closeInvitation()
      }}
    />
  ) : signedOutReady ? (
    <AuthActions
      primary={{
        label: copy.joinLink.existingAction,
        icon: ArrowRight,
        disabled: busy,
        onPress: () => router.push(AUTH_ROUTES.signIn)
      }}
      secondary={{
        label: copy.joinLink.newAction,
        disabled: busy,
        onPress: () => router.push(AUTH_ROUTES.createAccount)
      }}
    />
  ) : reviewReady ? (
    <View style={styles.footerActions}>
      <AuthActions
        primary={{
          label: copy.joinLink.joinAction,
          icon: ArrowRight,
          disabled: busy,
          onPress: () => void acceptInvitation()
        }}
        secondary={{
          label: copy.joinLink.notNowAction,
          disabled: busy,
          onPress: deferInvitation
        }}
      />
      <TextAction
        disabled={busy}
        label={copy.joinLink.useAnotherAccount}
        onPress={() => void useAnotherAccount()}
      />
    </View>
  ) : undefined;

  const heading = receipt
    ? {
        eyebrow: copy.joinLink.receiptEyebrow,
        title: copy.joinLink.receiptTitle,
        body: copy.joinLink.receiptBody
      }
    : isAccepting
      ? {
          eyebrow: copy.joinLink.eyebrow,
          title: copy.joinLink.acceptingTitle,
          body: copy.joinLink.acceptingBody
        }
      : isReviewing
        ? {
            eyebrow: copy.joinLink.eyebrow,
            title: copy.joinLink.reviewingTitle,
            body: copy.joinLink.reviewingBody
          }
        : isStaging
          ? {
              eyebrow: copy.joinLink.eyebrow,
              title: copy.joinLink.protectingTitle,
              body: copy.joinLink.protectingBody
            }
          : failedAction === "accept" && retryableFailure
            ? {
                eyebrow: copy.joinLink.eyebrow,
                title: copy.joinLink.acceptRetryTitle,
                body: copy.joinLink.acceptRetryBody
              }
            : failedAction && retryableFailure
              ? {
                  eyebrow: copy.joinLink.eyebrow,
                  title: copy.joinLink.retryTitle,
                  body: copy.joinLink.retryBody
                }
              : invalid
                ? {
                    eyebrow: copy.joinLink.eyebrow,
                    title: copy.joinLink.invalidTitle,
                    body: copy.joinLink.invalidBody
                  }
                : reviewReady
                  ? {
                      eyebrow: copy.joinLink.eyebrow,
                      title: copy.joinLink.reviewTitle,
                      body: copy.joinLink.reviewBody
                    }
                  : {
                      eyebrow: copy.joinLink.eyebrow,
                      title: copy.joinLink.title,
                      body: copy.joinLink.body
                    };

  return (
    <AuthScaffold
      footer={footer}
      onBack={() => {
        if (receipt) {
          router.replace("/");
          return;
        }
        void closeInvitation();
      }}
      testID="join-household-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={heading.body}
          eyebrow={heading.eyebrow}
          title={heading.title}
        />
        {loading ? (
          <View
            accessibilityRole="progressbar"
            style={styles.progress}
          >
            <ActivityIndicator color={colors.text} size="small" />
            <AuthNotice live>
              {isAccepting
                ? copy.joinLink.acceptingBody
                : isReviewing
                  ? copy.joinLink.reviewingBody
                  : copy.joinLink.protectingBody}
            </AuthNotice>
          </View>
        ) : retryableFailure ? (
          <AuthNotice live tone="attention">
            {failedAction === "accept"
              ? copy.joinLink.acceptRetryBody
              : copy.joinLink.retryBody}
          </AuthNotice>
        ) : invalid ? (
          <AuthNotice live tone="attention">
            {copy.joinLink.invalidBody}
          </AuthNotice>
        ) : review ? (
          <View style={styles.review}>
            <AuthStatusRow
              detail={copy.joinLink.reviewBody}
              eyebrow={copy.joinLink.householdLabel}
              icon={House}
              state={receipt ? "success" : "ready"}
              value={review.householdName}
            />
            <AuthStatusRow
              detail={roleDetail}
              eyebrow={copy.joinLink.accessLabel}
              icon={IdentificationCard}
              state={receipt ? "success" : "ready"}
              value={roleLabel}
            />
            <AuthStatusRow
              detail={copy.joinLink.protectedNotice}
              eyebrow={copy.joinLink.expiresLabel}
              icon={CalendarBlank}
              state={receipt ? "success" : "ready"}
              value={expiresAt}
            />
          </View>
        ) : (
          <View style={styles.protected}>
            <ShieldCheck color={colors.text} size={24} />
            <AuthNotice>{copy.joinLink.protectedNotice}</AuthNotice>
          </View>
        )}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  progress: {
    gap: spacing.md,
    alignItems: "flex-start"
  },
  review: {
    gap: spacing.sm
  },
  protected: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  footerActions: {
    gap: spacing.md,
    alignItems: "center"
  }
});
