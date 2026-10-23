import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import * as SecureStore from "expo-secure-store";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");

type CreateLoanResponse = {
  message?: string;
  loan?: {
    id: string;
    friendName: string;
    amount: string | number;
    dueDate: string;
    isRepaid: boolean;
  };
};

const COLORS = {
  background: "#F8F7F4",
  surface: "#FFFFFF",
  primary: "#123D2E",
  green: "#176B4C",
  ink: "#161D1A",
  muted: "#68756D",
  border: "#E1E6E1",
  error: "#B42318",
  errorBg: "#FEF0EF",
};

// Backend schema: amount is a string like "255" or "255.50" (max 10 digits, 2 decimals).
const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

function isValidDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Keeps only digits and one dot, max 10 whole digits and 2 decimals.
const sanitizeAmount = (text: string) => {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole.slice(0, 10);
  return `${whole.slice(0, 10)}.${rest.join("").slice(0, 2)}`;
};

// Auto-inserts dashes while typing: 20261115 -> 2026-11-15
const formatDateInput = (text: string) => {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

async function getAccessToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return typeof sessionStorage === "undefined"
        ? null
        : sessionStorage.getItem("accessToken");
    }
    return await SecureStore.getItemAsync("accessToken");
  } catch {
    return null;
  }
}

async function clearAccessToken() {
  try {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("accessToken");
    } else {
      await SecureStore.deleteItemAsync("accessToken");
    }
  } catch {
    // ignore
  }
}

export default function AddLoanScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await getAccessToken();
      if (!active) return;
      if (!saved) {
        setCheckingSession(false);
        router.replace("/");
        return;
      }
      setToken(saved);
      setCheckingSession(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/explore");
  };

  const submit = async () => {
    const cleanName = friendName.trim();
    const cleanAmount = amount.trim();
    const cleanDate = dueDate.trim();

    if (!API_BASE_URL) {
      setError("API URL is missing. Set EXPO_PUBLIC_API_URL in mobile/.env.");
      return;
    }
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      return;
    }
    if (!cleanName) {
      setError("Enter your friend's name.");
      return;
    }
    if (!AMOUNT_PATTERN.test(cleanAmount) || Number(cleanAmount) <= 0) {
      setError("Enter an amount greater than zero (up to 2 decimal places).");
      return;
    }
    if (!isValidDateOnly(cleanDate)) {
      setError("Enter a valid due date in YYYY-MM-DD format.");
      return;
    }

    // Matches the backend createLoanSchema: amount is sent as a string.
    const payload = {
      friendName: cleanName,
      amount: cleanAmount,
      dueDate: cleanDate,
    };

    setSaving(true);
    setError("");

    try {
      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}/api/loans`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch {
        throw new Error("Could not reach the server. Check the API URL and backend.");
      }

      const data: CreateLoanResponse & {
        errors?: { fieldErrors?: Record<string, string[]> };
      } = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          await clearAccessToken();
          router.replace("/");
          throw new Error("Your session has expired. Please sign in again.");
        }

        // Surface field-level validation errors from the backend (zod flatten()).
        const fieldErrors = data?.errors?.fieldErrors;
        const detail = fieldErrors
          ? Object.entries(fieldErrors)
              .map(([field, msgs]) => `${field}: ${(msgs ?? []).join(", ")}`)
              .join(" | ")
          : "";

        throw new Error(
          [
            typeof data.message === "string"
              ? data.message
              : `Could not create the loan (HTTP ${response.status}).`,
            detail,
          ]
            .filter(Boolean)
            .join(" - ")
        );
      }

      if (!data.loan) {
        throw new Error("The server responded without returning the created loan.");
      }

      setFriendName("");
      setAmount("");
      setDueDate("");
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the loan.");
    } finally {
      setSaving(false);
    }
  };

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.green} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content"  />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              onPress={goBack}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.backButton}
            >
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>MINILEDGER</Text>
              <Text style={styles.title}>Record a new loan</Text>
              <Text style={styles.subtitle}>Keep a clear record of money lent to someone.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Loan details</Text>

            <Text style={styles.label}>Friend's name</Text>
            <TextInput
              value={friendName}
              onChangeText={setFriendName}
              placeholder="e.g. Parth Mishra"
              placeholderTextColor="#929B94"
              style={styles.input}
              autoCapitalize="words"
              maxLength={100}
              returnKeyType="next"
              editable={!saving}
            />

            <Text style={styles.label}>Amount (INR)</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.currency}>₹</Text>
              <TextInput
                value={amount}
                onChangeText={(text) => setAmount(sanitizeAmount(text))}
                placeholder="0.00"
                placeholderTextColor="#929B94"
                style={styles.amountInput}
                keyboardType="decimal-pad"
                returnKeyType="next"
                editable={!saving}
              />
            </View>

            <Text style={styles.label}>Due date</Text>
            <TextInput
              value={dueDate}
              onChangeText={(text) => setDueDate(formatDateInput(text))}
              placeholder="YYYY-MM-DD (e.g. 2026-11-15)"
              placeholderTextColor="#929B94"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="number-pad"
              maxLength={10}
              editable={!saving}
            />
            <Text style={styles.hint}>
              Type the date as digits, for example 20261115. Dashes are added for you.
            </Text>
          </View>

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Personal ledger record</Text>
            <Text style={styles.noticeText}>
              This saves the name, amount, and due date to your account. No message or payment is
              sent.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={submit}
            style={({ pressed }) => [
              styles.submitButton,
              pressed && !saving ? styles.pressed : null,
              saving ? styles.disabled : null,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Save loan</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={goBack}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    backgroundColor: COLORS.background,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backText: { color: COLORS.ink, fontSize: 30, lineHeight: 34, marginTop: -3 },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.green, fontSize: 10, fontWeight: "700", letterSpacing: 1.6 },
  title: { color: COLORS.primary, fontSize: 28, lineHeight: 34, fontWeight: "700", marginTop: 5 },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: { color: COLORS.primary, fontSize: 17, fontWeight: "700", marginBottom: 8 },
  label: { color: COLORS.ink, fontSize: 12, fontWeight: "700", marginTop: 17, marginBottom: 7 },
  input: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    color: COLORS.ink,
    backgroundColor: "#FCFDFC",
    fontSize: 14,
  },
  amountInputWrap: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingHorizontal: 4,
  },
  currency: { color: COLORS.muted, fontSize: 25, marginRight: 10 },
  amountInput: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "600",
    paddingVertical: 8,
  },
  hint: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 7 },
  notice: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#EAF3ED",
    borderWidth: 1,
    borderColor: "#D8E7DC",
  },
  noticeTitle: { color: COLORS.primary, fontSize: 13, fontWeight: "700" },
  noticeText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  errorBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: "#F4C7C3",
  },
  errorText: { color: COLORS.error, fontSize: 12, lineHeight: 18 },
  submitButton: {
    minHeight: 52,
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  cancelButton: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  cancelText: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
});