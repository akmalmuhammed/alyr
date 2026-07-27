import {
  hasFieldErrors,
  maskEmail,
  normalizeEmail,
  normalizePilotAccessCode,
  validateCreateAccount,
  validateEmail,
  validateHouseholdName,
  validatePassword,
  validatePilotAccessCode,
  validatePasswordReset,
  validateSignIn
} from "@/auth/validation";

describe("auth validation", () => {
  it("normalizes and validates an email without accepting incomplete domains", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe(
      "owner@example.com"
    );
    expect(validateEmail("owner@example.com")).toBeNull();
    expect(validateEmail("owner@example")).toMatch(/complete email/i);
    expect(validateEmail("")).toMatch(/enter your email/i);
  });

  it("supports long password-manager credentials without arbitrary symbols", () => {
    expect(validatePassword("correct horse battery staple")).toBeNull();
    expect(validatePassword("short")).toMatch(/10 characters/i);
    expect(
      validatePassword("owner-super-secure", "owner@example.com")
    ).toMatch(/email name/i);
  });

  it("returns field-specific account recovery guidance", () => {
    const errors = validateCreateAccount({
      email: "bad",
      password: "too short",
      confirmPassword: "different"
    });
    expect(errors).toEqual({
      email: expect.stringMatching(/complete email/i),
      password: expect.stringMatching(/10 characters/i),
      confirmPassword: expect.stringMatching(/do not match/i)
    });
    expect(hasFieldErrors(errors)).toBe(true);
  });

  it("requires and canonicalizes pilot access only for signed signup", () => {
    expect(normalizePilotAccessCode(" alyr-aaaa bbbb-cccc ")).toBe(
      "ALYRAAAABBBBCCCC"
    );
    expect(validatePilotAccessCode("ALYR-AAAA-BBBB-CCCC")).toBeNull();
    expect(validatePilotAccessCode("short")).toMatch(/full pilot access/i);
    expect(
      validateCreateAccount({
        email: "owner@example.com",
        password: "correct horse battery staple",
        confirmPassword: "correct horse battery staple",
        pilotAccessCode: "",
        requirePilotAccess: true
      })
    ).toEqual({
      pilotAccessCode: "Enter your pilot access code."
    });
    expect(
      validateCreateAccount({
        email: "owner@example.com",
        password: "correct horse battery staple",
        confirmPassword: "correct horse battery staple"
      })
    ).toEqual({});
  });

  it("does not impose create-account password rules on an existing sign-in", () => {
    expect(
      validateSignIn({ email: "owner@example.com", password: "old-pass" })
    ).toEqual({});
    expect(
      validateSignIn({ email: "owner@example.com", password: "" })
    ).toEqual({ password: "Enter your password." });
  });

  it("requires a strong matching password during recovery", () => {
    expect(
      validatePasswordReset({
        email: "owner@example.com",
        password: "correct horse battery staple",
        confirmPassword: "correct horse battery staple"
      })
    ).toEqual({});
    expect(
      validatePasswordReset({
        email: "owner@example.com",
        password: "short",
        confirmPassword: "different"
      })
    ).toEqual({
      password: expect.stringMatching(/10 characters/i),
      confirmPassword: expect.stringMatching(/do not match/i)
    });
  });

  it("keeps household labels compact and masks email for confirmation UI", () => {
    expect(validateHouseholdName("My household")).toBeNull();
    expect(validateHouseholdName(" ")).toMatch(/household name/i);
    expect(validateHouseholdName("x")).toMatch(/2 characters/i);
    expect(maskEmail("akmal@example.com")).toBe("ak•••@example.com");
  });
});
