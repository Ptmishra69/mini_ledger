import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

const C = {
  background: "#F5F7F4",
  surface: "#FFFFFF",
  ink: "#15251D",
  muted: "#68756D",
  green: "#176B4C",
  greenDark: "#103D2C",
  greenSoft: "#E4F3E9",
  border: "#DDE5DE",
  red: "#B42318",
  redSoft: "#FEF0EF",
  amber: "#8A5A00",
  amberSoft: "#FFF3D9",
};

type Loan = {
  id: string;
  userId: string;
  friendName: string;
  amount: string | number;
  dueDate: string;
  isRepaid: boolean;
  repaidAt: string | null;
  createdAt: string;
  isOverdue?: boolean;
};

type LoanSummary = {
  totalLent: string | number;
  totalRepaid: string | number;
  overdueAmount: string | number;
  outstandingAmount: string | number;
};

type LoansResponse = { loans: Loan[] };
type SummaryResponse = LoanSummary;
type CreateLoanResponse = { message?: string; loan: Loan };
type RepayResponse = { message?: string; loan: Loan };

type Filter = "All" | "Overdue" | "Upcoming" | "Settled";

const FILTERS: Filter[] = ["All", "Overdue", "Upcoming", "Settled"];

const money = (value: string | number | null | undefined) => {
  const amount = Number(value ?? 0);
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}`;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const dayDifference = (value: string) => {
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
};

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

async function apiRequest<T>(
  path: string,
  token: string,
  options: { method?: string; body?: object } = {}
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("API URL is missing. Set EXPO_PUBLIC_API_URL in mobile/.env.");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new Error("Could not reach the server. Check the API URL and backend.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    // Surface field-level validation errors from the backend (zod flatten()).
    const fieldErrors = data?.errors?.fieldErrors;
    const detail = fieldErrors
      ? Object.entries(fieldErrors)
          .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
          .join(" | ")
      : "";

    throw new Error(
      [
        typeof data.message === "string" ? data.message : "Request failed. Please try again.",
        detail,
      ]
        .filter(Boolean)
        .join(" - ")
    );
  }
  return data as T;
}

/* ------------------------------------------------------------------ */
/* StatCard                                                            */
/* ------------------------------------------------------------------ */
function StatCard({
  label,
  value,
  icon,
  green = false,
  red = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  green?: boolean;
  red?: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <Text style={styles.statLabel}>{label}</Text>
        <MaterialCommunityIcons
          name={icon}
          size={16}
          color={red ? C.red : green ? C.green : C.muted}
        />
      </View>
      <Text
        style={[
          styles.statValue,
          green && styles.statValueGreen,
          red && styles.statValueRed,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */
export default function ExploreScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const loadDashboard = useCallback(async (currentToken: string) => {
    setError("");
    try {
      const [loansResult, summaryResult] = await Promise.all([
        apiRequest<LoansResponse>("/api/loans", currentToken),
        apiRequest<SummaryResponse>("/api/loans/summary", currentToken),
      ]);
      setLoans(Array.isArray(loansResult.loans) ? loansResult.loans : []);
      setSummary(summaryResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load your ledger.";
      setError(message);
      if (message.includes("session has expired")) {
        if (Platform.OS === "web") {
          sessionStorage.removeItem("accessToken");
        } else {
          await SecureStore.deleteItemAsync("accessToken").catch(() => undefined);
        }
        router.replace("/");
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const savedToken = await getAccessToken();
      if (!active) return;
      if (!savedToken) {
        setError("Sign in to view your ledger.");
        setLoading(false);
        router.replace("/");
        return;
      }
      setToken(savedToken);
      await loadDashboard(savedToken);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadDashboard]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    await loadDashboard(token);
    setRefreshing(false);
  }, [loadDashboard, token]);

  // Reload the ledger whenever this screen comes back into focus (e.g. after adding a loan).
  useFocusEffect(
    useCallback(() => {
      if (token) loadDashboard(token);
    }, [token, loadDashboard])
  );

  const activeLoans = loans.filter((loan) => !loan.isRepaid);
  const overdueLoans = activeLoans.filter(
    (loan) =>
      loan.isOverdue ??
      (dayDifference(loan.dueDate) !== null && (dayDifference(loan.dueDate) as number) < 0)
  );
  const totalLent = Number(
    summary?.totalLent ?? loans.reduce((sum, loan) => sum + Number(loan.amount), 0)
  );
  const totalRepaid = Number(
    summary?.totalRepaid ??
      loans.filter((loan) => loan.isRepaid).reduce((sum, loan) => sum + Number(loan.amount), 0)
  );
  const overdueAmount = Number(
    summary?.overdueAmount ?? overdueLoans.reduce((sum, loan) => sum + Number(loan.amount), 0)
  );
  const outstandingAmount = Number(
    summary?.outstandingAmount ?? activeLoans.reduce((sum, loan) => sum + Number(loan.amount), 0)
  );

  const visibleLoans = useMemo(() => {
    switch (filter) {
      case "Overdue":
        return loans.filter(
          (loan) =>
            !loan.isRepaid && (loan.isOverdue ?? ((dayDifference(loan.dueDate) ?? 0) < 0))
        );
      case "Upcoming":
        return loans.filter(
          (loan) => !loan.isRepaid && (dayDifference(loan.dueDate) ?? -1) >= 0
        );
      case "Settled":
        return loans.filter((loan) => loan.isRepaid);
      default:
        return loans.filter((loan) => !loan.isRepaid);
    }
  }, [filter, loans]);

  const handleAddLoan = async () => {
    const cleanName = friendName.trim();
    const cleanAmount = amount.trim();
    const cleanDate = dueDate.trim();

    if (!token) {
      setError("Your session is missing. Please sign in again.");
      return;
    }

    if (!cleanName) {
      setError("Enter your friend's name.");
      return;
    }

    // Backend expects amount as a string like "255" or "255.50".
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(cleanAmount) || Number(cleanAmount) <= 0) {
      setError("Enter an amount greater than zero (up to 2 decimal places).");
      return;
    }

    // Validate YYYY-MM-DD and reject impossible calendar dates.
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanDate);

    if (!dateMatch) {
      setError("Enter the due date as YYYY-MM-DD.");
      return;
    }

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const checkedDate = new Date(Date.UTC(year, month - 1, day));

    if (
      checkedDate.getUTCFullYear() !== year ||
      checkedDate.getUTCMonth() !== month - 1 ||
      checkedDate.getUTCDate() !== day
    ) {
      setError("Enter a valid calendar date.");
      return;
    }

    const payload = {
      friendName: cleanName,
      amount: cleanAmount,
      dueDate: cleanDate,
    };

    setSaving(true);
    setError("");

    try {
      await apiRequest<CreateLoanResponse>("/api/loans", token, {
        method: "POST",
        body: payload,
      });

      setFriendName("");
      setAmount("");
      setDueDate("");
      setAddModalVisible(false);

      await loadDashboard(token);
    } catch (err) {
      console.error("[MiniLedger] Loan creation failed:", err);
      const message = err instanceof Error ? err.message : "Could not create the loan.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // Backend route: PATCH /api/loans/:id/repay
  const handleRepay = async (loan: Loan) => {
    if (!token || busyLoanId) return;

    setBusyLoanId(loan.id);
    setError("");

    try {
      await apiRequest<RepayResponse>(`/api/loans/${loan.id}/repay`, token, {
        method: "PATCH",
      });
      await loadDashboard(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not mark this loan as repaid.";
      setError(message);
    } finally {
      setBusyLoanId(null);
    }
  };

  const confirmRepay = (loan: Loan) => {
    const message = `Mark ${money(loan.amount)} from ${loan.friendName} as repaid?`;
    if (Platform.OS === "web") {
      // Alert.alert with buttons is not supported on web.
      if (typeof window !== "undefined" && window.confirm(message)) {
        handleRepay(loan);
      }
      return;
    }
    Alert.alert("Mark as repaid", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Mark repaid", onPress: () => handleRepay(loan) },
    ]);
  };

  const closeModal = () => {
    if (saving) return;
    setAddModalVisible(false);
    setError("");
  };

  const openModal = () => {
    setError("");
    router.push("/add-loan");
  };

  const emptyMessage: Record<Filter, string> = {
    All: "No active loans. Add one to start tracking what friends owe you.",
    Overdue: "Nothing overdue. Nice.",
    Upcoming: "No upcoming repayments.",
    Settled: "No settled loans yet.",
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <MaterialCommunityIcons name="notebook-outline" size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.brand}>MiniLedger</Text>
              <Text style={styles.brandCaption}>Track money lent to friends</Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            onPress={refresh}
            disabled={!token || refreshing}
            accessibilityLabel="Refresh"
          >
            <MaterialCommunityIcons name="refresh" size={20} color={C.ink} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} />
          }
        >
          {/* Intro */}
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>YOUR LEDGER</Text>
            <Text style={styles.title}>Who owes you</Text>
            <Text style={styles.subtitle}>
              Keep track of loans, due dates and repayments in one place.
            </Text>
          </View>

          {/* Error */}
          {!!error && !addModalVisible && (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={C.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Balance card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>OUTSTANDING</Text>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" style={styles.balanceLoader} />
            ) : (
              <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit>
                {money(outstandingAmount)}
              </Text>
            )}
            <View style={styles.balanceBottom}>
              <Text style={styles.balanceCaption}>
                {activeLoans.length} active {activeLoans.length === 1 ? "loan" : "loans"}
              </Text>
              {overdueLoans.length > 0 && (
                <View style={styles.balancePill}>
                  <View style={styles.balanceDot} />
                  <Text style={styles.balancePillText}>{overdueLoans.length} overdue</Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsGrid}>
            <StatCard label="Lent" value={money(totalLent)} icon="arrow-top-right" />
            <StatCard label="Repaid" value={money(totalRepaid)} icon="check-circle-outline" green />
            <StatCard
              label="Overdue"
              value={money(overdueAmount)}
              icon="clock-alert-outline"
              red={overdueAmount > 0}
            />
          </View>

          {/* Section header */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Loans</Text>
              <Text style={styles.sectionCaption}>
                {visibleLoans.length} {visibleLoans.length === 1 ? "entry" : "entries"}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              onPress={openModal}
              disabled={!token}
            >
              <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add loan</Text>
            </Pressable>
          </View>

          {/* Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map((item) => {
              const active = filter === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* List */}
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={C.green} />
              <Text style={styles.loadingText}>Loading your ledger…</Text>
            </View>
          ) : visibleLoans.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons name="wallet-outline" size={26} color={C.green} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here</Text>
              <Text style={styles.emptyText}>{emptyMessage[filter]}</Text>
              {filter === "All" && (
                <Pressable
                  style={({ pressed }) => [styles.emptyAddButton, pressed && styles.pressed]}
                  onPress={openModal}
                  disabled={!token}
                >
                  <Text style={styles.emptyAddText}>Add your first loan</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.loanList}>
              {visibleLoans.map((loan) => {
                const diff = dayDifference(loan.dueDate);
                const overdue =
                  !loan.isRepaid && (loan.isOverdue ?? (diff !== null && diff < 0));

                let statusLabel = "Upcoming";
                if (loan.isRepaid) statusLabel = "Settled";
                else if (overdue) statusLabel = "Overdue";
                else if (diff === 0) statusLabel = "Due today";
                else if (diff !== null) statusLabel = `Due in ${diff}d`;

                let footerText = `Due ${formatDate(loan.dueDate)}`;
                if (loan.isRepaid && loan.repaidAt) {
                  footerText = `Repaid ${formatDate(loan.repaidAt)}`;
                } else if (overdue && diff !== null) {
                  footerText = `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "day" : "days"} past due`;
                }

                const busy = busyLoanId === loan.id;

                return (
                  <View key={loan.id} style={styles.loanCard}>
                    <View style={styles.loanTop}>
                      <View style={[styles.avatar, loan.isRepaid && styles.avatarSettled]}>
                        <Text style={styles.avatarText}>{initials(loan.friendName) || "?"}</Text>
                      </View>
                      <View style={styles.loanNameBlock}>
                        <Text style={styles.friendName} numberOfLines={1}>
                          {loan.friendName}
                        </Text>
                        <Text style={styles.dueDate}>Due {formatDate(loan.dueDate)}</Text>
                      </View>
                      <View style={styles.loanAmountBlock}>
                        <Text style={styles.loanAmount} numberOfLines={1} adjustsFontSizeToFit>
                          {money(loan.amount)}
                        </Text>
                        <View
                          style={[
                            styles.statusPill,
                            overdue && styles.statusPillOverdue,
                            loan.isRepaid && styles.statusPillSettled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              overdue && styles.statusTextOverdue,
                              loan.isRepaid && styles.statusTextSettled,
                            ]}
                          >
                            {statusLabel}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.loanFooter}>
                      <Text style={styles.loanFooterText}>{footerText}</Text>
                      {!loan.isRepaid && (
                        <Pressable
                          style={({ pressed }) => [
                            styles.repaidButton,
                            !!busyLoanId && styles.buttonDisabled,
                            pressed && styles.pressed,
                          ]}
                          onPress={() => confirmRepay(loan)}
                          disabled={!!busyLoanId}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={C.green} />
                          ) : (
                            <MaterialCommunityIcons name="check" size={14} color={C.green} />
                          )}
                          <Text style={styles.repaidButtonText}>Mark repaid</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.footerNote}>Pull down to refresh. Amounts are in Indian rupees.</Text>
        </ScrollView>
      </View>

      {/* Add loan modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalDismissArea} onPress={closeModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add loan</Text>
                <Text style={styles.modalSubtitle}>Record money you lent to a friend.</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeModal} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={18} color={C.ink} />
              </Pressable>
            </View>

            {!!error && (
              <View style={styles.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={C.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Friend's name</Text>
            <TextInput
              style={styles.fieldInput}
              value={friendName}
              onChangeText={setFriendName}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor={C.muted}
              autoCapitalize="words"
              maxLength={100}
              editable={!saving}
            />

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <TextInput
              style={styles.fieldInput}
              value={amount}
              onChangeText={(text) => setAmount(sanitizeAmount(text))}
              placeholder="e.g. 500"
              placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
              editable={!saving}
            />

            <Text style={styles.fieldLabel}>Due date</Text>
            <TextInput
              style={styles.fieldInput}
              value={dueDate}
              onChangeText={(text) => setDueDate(formatDateInput(text))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.muted}
              keyboardType="number-pad"
              maxLength={10}
              editable={!saving}
            />
            <Text style={styles.dateHint}>Type the date as digits, for example 20261115.</Text>

            <Pressable
              style={({ pressed }) => [
                styles.modalSubmit,
                saving && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
              onPress={handleAddLoan}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalSubmitText}>Save loan</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  page: { flex: 1, width: "100%", maxWidth: 600, alignSelf: "center" },
  header: {
    minHeight: 84,
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "android" ? 18 : 14,
    paddingBottom: 14,
    backgroundColor: C.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.greenDark,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: C.ink, fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.4 },
  brandCaption: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 44 },
  intro: { marginBottom: 24 },
  eyebrow: { color: C.green, fontSize: 10, lineHeight: 15, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
  title: { color: C.ink, fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.8 },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F4C7C3",
    backgroundColor: C.redSoft,
  },
  errorText: { flex: 1, color: C.red, fontSize: 12, lineHeight: 18 },
  balanceCard: {
    backgroundColor: C.greenDark,
    borderRadius: 21,
    padding: 22,
    marginBottom: 12,
    overflow: "hidden",
  },
  balanceLabel: { color: "#B9D9C7", fontSize: 10, lineHeight: 15, fontWeight: "700", letterSpacing: 1.1 },
  balanceAmount: { color: "#FFFFFF", fontSize: 35, lineHeight: 43, fontWeight: "700", letterSpacing: -1, marginTop: 8 },
  balanceLoader: { alignSelf: "flex-start", marginVertical: 16 },
  balanceBottom: { marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  balanceCaption: { color: "#D0E5D8", fontSize: 12, lineHeight: 18 },
  balancePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  balanceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFB5AB" },
  balancePillText: { color: "#FFFFFF", fontSize: 11, lineHeight: 15, fontWeight: "600" },
  statsGrid: { flexDirection: "row", gap: 9, marginBottom: 30 },
  statCard: { flex: 1, minWidth: 0, padding: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 15 },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  statLabel: { color: C.muted, fontSize: 10, lineHeight: 15, fontWeight: "600", flexShrink: 1 },
  statValue: { color: C.ink, fontSize: 16, lineHeight: 22, fontWeight: "700", marginTop: 9 },
  statValueGreen: { color: C.green },
  statValueRed: { color: C.red },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 },
  sectionTitle: { color: C.ink, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.4 },
  sectionCaption: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  addButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 13, backgroundColor: C.greenDark, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  addButtonText: { color: "#FFFFFF", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  filters: { flexDirection: "row", gap: 8, paddingBottom: 16 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterChipActive: { backgroundColor: C.greenDark, borderColor: C.greenDark },
  filterText: { color: C.muted, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  filterTextActive: { color: "#FFFFFF" },
  loadingState: { paddingVertical: 40, alignItems: "center", gap: 12 },
  loadingText: { color: C.muted, fontSize: 13, lineHeight: 19 },
  emptyState: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 32, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: C.greenSoft, alignItems: "center", justifyContent: "center", marginBottom: 13 },
  emptyTitle: { color: C.ink, fontSize: 17, lineHeight: 23, fontWeight: "700" },
  emptyText: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6, maxWidth: 270 },
  emptyAddButton: { backgroundColor: C.greenDark, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 11, marginTop: 17 },
  emptyAddText: { color: "#FFFFFF", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  loanList: { gap: 11 },
  loanCard: { padding: 15, backgroundColor: C.surface, borderRadius: 17, borderWidth: 1, borderColor: C.border },
  loanTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 43, height: 43, borderRadius: 15, backgroundColor: C.greenSoft, alignItems: "center", justifyContent: "center" },
  avatarSettled: { backgroundColor: "#EDF0EE" },
  avatarText: { color: C.greenDark, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  loanNameBlock: { flex: 1, minWidth: 0 },
  friendName: { color: C.ink, fontSize: 14, lineHeight: 19, fontWeight: "700" },
  dueDate: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  loanAmountBlock: { alignItems: "flex-end", maxWidth: "42%" },
  loanAmount: { color: C.ink, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  statusPill: { marginTop: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: C.amberSoft },
  statusPillOverdue: { backgroundColor: C.redSoft },
  statusPillSettled: { backgroundColor: C.greenSoft },
  statusText: { color: C.amber, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  statusTextOverdue: { color: C.red },
  statusTextSettled: { color: C.green },
  loanFooter: { marginTop: 13, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  loanFooterText: { color: C.muted, fontSize: 11, lineHeight: 16, flexShrink: 1 },
  repaidButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: C.greenSoft },
  repaidButtonText: { color: C.green, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  buttonDisabled: { opacity: 0.55 },
  footerNote: { color: C.muted, fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 24 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(13, 29, 20, 0.42)" },
  modalDismissArea: { flex: 1 },
  modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 30 : 24 },
  modalHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: 18 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 21 },
  modalTitle: { color: C.ink, fontSize: 23, lineHeight: 29, fontWeight: "700", letterSpacing: -0.5 },
  modalSubtitle: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  closeButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  fieldLabel: { color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: "700", marginBottom: 7, marginTop: 10 },
  fieldInput: { minHeight: 49, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 13, color: C.ink, fontSize: 14, backgroundColor: "#FCFDFC" },
  dateHint: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  modalSubmit: { minHeight: 52, borderRadius: 14, backgroundColor: C.greenDark, alignItems: "center", justifyContent: "center", marginTop: 20 },
  modalSubmitText: { color: "#FFFFFF", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  pressed: { opacity: 0.82 },
});