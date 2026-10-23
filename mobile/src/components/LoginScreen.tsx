import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const OTP_LENGTH = 6;

type AuthUser = {
  id: string;
  phone: string;
  createdAt?: string;
};

type SendOtpResponse = {
  message?: string;
};

type VerifyOtpResponse = {
  message?: string;
  accessToken: string;
  user: AuthUser;
};

type LoginScreenProps = {
  /**
   * Pass this callback from the app's auth/session layer.
   * Store the token securely there, then navigate to the authenticated app.
   */
  onAuthenticated?: (accessToken: string, user: AuthUser) => void;
};

const COLORS = {
  background: "#F5F7F4",
  surface: "#FFFFFF",
  ink: "#15251D",
  muted: "#68756D",
  green: "#176B4C",
  greenDark: "#103D2C",
  greenSoft: "#E4F3E9",
  border: "#DDE5DE",
  danger: "#B42318",
  dangerSoft: "#FEF0EF",
};

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");
  const otpInputRef = useRef<React.ElementRef<typeof TextInput>>(null);

  const normalizedPhone = phone.replace(/\D/g, "");
  const validPhone = normalizedPhone.length === 10;
  const validOtp = otp.length === OTP_LENGTH;

  const request = async <T,>(path: string, body: object): Promise<T> => {
    if (!API_BASE_URL) {
      throw new Error(
        "API URL is not configured. Set EXPO_PUBLIC_API_URL in your mobile .env file."
      );
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(
        "Can't reach the server. Check that the backend is running and the API URL is correct."
      );
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof data.message === "string"
          ? data.message
          : "Something went wrong. Please try again."
      );
    }
    return data as T;
  };

  const handleSendOtp = async () => {
    if (!validPhone || loading) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    setError("");
    setLoading("send");
    try {
      await request<SendOtpResponse>("/api/auth/send-otp", {
        phone: `+91${normalizedPhone}`,
      });
      setOtpSent(true);
      setOtp("");
      setError("");
      setTimeout(() => otpInputRef.current?.focus(), 250);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the code.");
    } finally {
      setLoading(null);
    }
  };

  const handleVerifyOtp = async () => {
    
    if (!validOtp || loading) {
      setError("Enter the 6-digit code.");
      return;
    }

    setError("");
    setLoading("verify");
    try {
      const result = await request<VerifyOtpResponse>("/api/auth/verify-otp", {
        phone: `+91${normalizedPhone}`,
        otp,
      });
      console.log("OTP VERIFY RESPONSE:", result);

      if (!result.accessToken || !result.user) {
        throw new Error("The server response was incomplete. Please try again.");
      }

      if (onAuthenticated) {
        onAuthenticated(result.accessToken, result.user);
      } else {
        Alert.alert(
          "Phone verified",
          "Verification succeeded. Connect this screen to your app's auth session to save the token and continue."
        );
      }
    } catch (err) {
        console.error("OTP VERIFY ERROR:", err);
      setError(err instanceof Error ? err.message : "Unable to verify the code.");
    } finally {
      setLoading(null);
    }
  };

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setPhone(digits);
    setError("");
    if (otpSent) {
      setOtpSent(false);
      setOtp("");
    }
  };

  const handleOtpChange = (value: string) => {
    setOtp(value.replace(/\D/g, "").slice(0, OTP_LENGTH));
    setError("");
  };

  const handleChangeNumber = () => {
    setOtpSent(false);
    setOtp("");
    setError("");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <View style={styles.logo}>
              <MaterialCommunityIcons
                name="wallet-outline"
                size={25}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.brand}>MiniLedger</Text>
          </View>

          <View style={styles.intro}>
            <Text style={styles.eyebrow}>YOUR MONEY, IN SYNC</Text>
            <Text style={styles.title}>
              {otpSent ? "Verify your number" : "Keep every loan clear."}
            </Text>
            <Text style={styles.subtitle}>
              {otpSent
                ? `Enter the code sent to +91 ${normalizedPhone}.`
                : "Track money lent to friends and keep repayments simple."}
            </Text>
          </View>

          <View style={styles.formCard}>
            {!otpSent ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <View style={styles.phoneInputRow}>
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>🇮🇳  +91</Text>
                    <MaterialCommunityIcons
                      name="chevron-down"
                      size={16}
                      color={COLORS.muted}
                    />
                  </View>
                  <View style={styles.inputDivider} />
                  <TextInput
                    value={phone}
                    onChangeText={handlePhoneChange}
                    placeholder="10-digit number"
                    placeholderTextColor="#9AA69D"
                    keyboardType="number-pad"
                    textContentType="telephoneNumber"
                    maxLength={10}
                    returnKeyType="done"
                    style={styles.phoneInput}
                    accessibilityLabel="Mobile number"
                  />
                </View>
                <Text style={styles.helper}>
                  We’ll send a one-time code to verify your number.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={!validPhone || loading !== null}
                  onPress={handleSendOtp}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (!validPhone || loading !== null) && styles.buttonDisabled,
                    pressed && validPhone && styles.pressed,
                  ]}
                >
                  {loading === "send" ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Send code</Text>
                      <MaterialCommunityIcons
                        name="arrow-right"
                        size={19}
                        color="#FFFFFF"
                      />
                    </>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.sentToRow}>
                  <View style={styles.sentIcon}>
                    <MaterialCommunityIcons
                      name="message-text-outline"
                      size={20}
                      color={COLORS.green}
                    />
                  </View>
                  <View style={styles.sentCopy}>
                    <Text style={styles.sentLabel}>CODE SENT TO</Text>
                    <Text style={styles.sentNumber}>
                      +91 {normalizedPhone}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleChangeNumber}
                    hitSlop={8}
                  >
                    <Text style={styles.changeText}>Change</Text>
                  </Pressable>
                </View>

                <Text style={[styles.label, styles.otpLabel]}>
                  6-digit verification code
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Enter verification code"
                  onPress={() => otpInputRef.current?.focus()}
                  style={styles.otpTouchArea}
                >
                  <View style={styles.otpRow}>
                    {Array.from({ length: OTP_LENGTH }, (_, index) => {
                      const digit = otp[index];
                      const activeIndex = Math.min(otp.length, OTP_LENGTH - 1);
                      return (
                        <View
                          key={index}
                          style={[
                            styles.otpBox,
                            index === activeIndex && styles.otpBoxActive,
                          ]}
                        >
                          <Text style={styles.otpDigit}>{digit ?? ""}</Text>
                          {!digit && index === activeIndex ? (
                            <View style={styles.otpCaret} />
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                  <TextInput
                    ref={otpInputRef}
                    value={otp}
                    onChangeText={handleOtpChange}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    maxLength={OTP_LENGTH}
                    caretHidden
                    style={styles.hiddenInput}
                    accessibilityLabel="One-time verification code"
                  />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={!validOtp || loading !== null}
                  onPress={handleVerifyOtp}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (!validOtp || loading !== null) && styles.buttonDisabled,
                    pressed && validOtp && styles.pressed,
                  ]}
                >
                  {loading === "verify" ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Verify and continue</Text>
                      <MaterialCommunityIcons
                        name="arrow-right"
                        size={19}
                        color="#FFFFFF"
                      />
                    </>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={loading !== null}
                  onPress={handleSendOtp}
                  style={styles.resendButton}
                >
                  <Text style={styles.resendText}>Send a new code</Text>
                </Pressable>
              </>
            )}

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={18}
                  color={COLORS.danger}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.securityNote}>
            <MaterialCommunityIcons
              name="lock-outline"
              size={16}
              color={COLORS.green}
            />
            <Text style={styles.securityText}>
              Your number is used to secure your account.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.greenDark,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: COLORS.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  intro: { marginTop: 48, marginBottom: 28 },
  eyebrow: {
    color: COLORS.green,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  title: {
    color: COLORS.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -1.1,
    maxWidth: 340,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12,
    maxWidth: 340,
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  label: {
    color: COLORS.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    marginBottom: 10,
  },
  phoneInputRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 12,
    backgroundColor: "#FCFDFC",
  },
  countryCode: { flexDirection: "row", alignItems: "center", gap: 4 },
  countryCodeText: { color: COLORS.ink, fontSize: 14, fontWeight: "600" },
  inputDivider: {
    width: 1,
    height: 25,
    backgroundColor: COLORS.border,
    marginHorizontal: 12,
  },
  phoneInput: {
    flex: 1,
    minWidth: 0,
    color: COLORS.ink,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 12,
  },
  helper: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 20,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: COLORS.greenDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  buttonDisabled: { opacity: 0.45 },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  pressed: { opacity: 0.82 },
  sentToRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 25,
  },
  sentIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sentCopy: { flex: 1 },
  sentLabel: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  sentNumber: {
    color: COLORS.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    marginTop: 2,
  },
  changeText: {
    color: COLORS.green,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  otpLabel: { marginBottom: 12 },
  otpTouchArea: { position: "relative", marginBottom: 22 },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 7 },
  otpBox: {
    flex: 1,
    maxWidth: 48,
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAF8",
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxActive: {
    borderWidth: 1.5,
    borderColor: COLORS.green,
    backgroundColor: "#FFFFFF",
  },
  otpDigit: {
    color: COLORS.ink,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "600",
  },
  otpCaret: {
    position: "absolute",
    width: 2,
    height: 22,
    backgroundColor: COLORS.green,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: 0,
    bottom: 0,
  },
  resendButton: { alignSelf: "center", padding: 10, marginTop: 4 },
  resendText: {
    color: COLORS.green,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F4C7C3",
    backgroundColor: COLORS.dangerSoft,
  },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 12, lineHeight: 18 },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 24,
    paddingHorizontal: 8,
  },
  securityText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
