import { useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/RegisterPage.module.css";

interface IncomeItem { label: string; amount: string; }
interface ExpenseItem { label: string; amount: string; }

export default function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName]                 = useState("");
  const [dob, setDob]                   = useState("");
  const [pan, setPan]                   = useState("");
  const [aadhar, setAadhar]             = useState("");
  const [email, setEmail]               = useState("");
  const [annualIncome, setAnnualIncome] = useState("");

  const [incomeItems, setIncomeItems]   = useState<IncomeItem[]>([{ label: "Rent Amount", amount: "" }]);
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([{ label: "Shop", amount: "1000" }]);

  const [showIncomePopup, setShowIncomePopup]   = useState(false);
  const [showExpensePopup, setShowExpensePopup] = useState(false);
  const [popupLabel, setPopupLabel]             = useState("");
  const [popupAmount, setPopupAmount]           = useState("");

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState(false);

  // ── Aadhar formatting: XXXX XXXX XXXX ──
  const formatAadhar = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 12);
    const parts  = digits.match(/.{1,4}/g);
    return parts ? parts.join(" ") : digits;
  };

  const handleAadharChange = (e: ChangeEvent<HTMLInputElement>) => {
    const formatted = formatAadhar(e.target.value);
    setAadhar(formatted);
    setErrors(err => ({ ...err, aadhar: "" }));
  };

  // ── PAN: only A-Z and 0-9 ──
  const handlePanChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10);
    setPan(raw);
    setErrors(err => ({ ...err, pan: "" }));
  };

  // ── Name: only letters & spaces ──
  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setName(val);
    setErrors(err => ({ ...err, name: "" }));
  };

  // ── Popup ──
  const openIncomePopup  = () => { setPopupLabel(""); setPopupAmount(""); setShowIncomePopup(true); };
  const openExpensePopup = () => { setPopupLabel(""); setPopupAmount(""); setShowExpensePopup(true); };

  const confirmIncome = () => {
    if (popupLabel.trim() || popupAmount.trim()) {
      setIncomeItems(i => [...i, { label: popupLabel, amount: popupAmount }]);
      setErrors(err => ({ ...err, income: "" }));
    }
    setShowIncomePopup(false);
  };

  const confirmExpense = () => {
    if (popupLabel.trim() || popupAmount.trim()) {
      setExpenseItems(e => [...e, { label: popupLabel, amount: popupAmount }]);
      setErrors(err => ({ ...err, expenses: "" }));
    }
    setShowExpensePopup(false);
  };

  const updateIncome  = (index: number, field: keyof IncomeItem, value: string) =>
    setIncomeItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  const updateExpense = (index: number, field: keyof ExpenseItem, value: string) =>
    setExpenseItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));

  const removeIncome  = (index: number) => setIncomeItems(i => i.filter((_, idx) => idx !== index));
  const removeExpense = (index: number) => setExpenseItems(e => e.filter((_, idx) => idx !== index));

  const totalIncome   = incomeItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const totalExpenses = expenseItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  // ── Field-level validation ──
  const validateField = (field: string, value: string) => {
    let error = "";
    switch (field) {
      case "name":
        if (!value.trim()) error = "Full name is required";
        else if (value.trim().length < 3) error = "Name must be at least 3 characters";
        break;
      case "dob":
        if (!value) error = "Date of birth is required";
        else {
          const birthDate = new Date(value);
          const today     = new Date();
          const age       = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())
            ? age - 1 : age;
          if (actualAge < 16) error = "You must be at least 16 years old";
        }
        break;
      case "pan":
        if (!value.trim()) error = "PAN number is required";
        else if (value.length < 10) error = "PAN must be 10 characters (e.g. ABCDE1234F)";
        else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value)) error = "Invalid PAN format (e.g. ABCDE1234F)";
        break;
      case "aadhar":
        if (!value.trim()) error = "Aadhar number is required";
        else if (value.replace(/\s/g, "").length !== 12) error = "Aadhar must be 12 digits";
        break;
      case "email":
        if (!value.trim()) error = "Email address is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = "Enter a valid email address";
        break;
    }
    return error;
  };

  const handleBlur = (field: string, value: string) => {
    setTouched(t => ({ ...t, [field]: true }));
    const error = validateField(field, value);
    setErrors(err => ({ ...err, [field]: error }));
  };

  const isFieldComplete = (field: string, value: string) => {
    return touched[field] && !validateField(field, value) && value.trim() !== "";
  };

  // ── Submit ──
  const validate = () => {
    const newErrors: Record<string, string> = {};

    const nameErr   = validateField("name", name);
    const dobErr    = validateField("dob", dob);
    const panErr    = validateField("pan", pan);
    const aadharErr = validateField("aadhar", aadhar);
    const emailErr  = validateField("email", email);

    if (nameErr)   newErrors.name   = nameErr;
    if (dobErr)    newErrors.dob    = dobErr;
    if (panErr)    newErrors.pan    = panErr;
    if (aadharErr) newErrors.aadhar = aadharErr;
    if (emailErr)  newErrors.email  = emailErr;

    if (incomeItems.every(item => !item.amount))
      newErrors.income = "Please add at least one income amount";
    if (expenseItems.every(item => !item.amount))
      newErrors.expenses = "Please add at least one expense amount";

    setErrors(newErrors);
    setTouched({ name: true, dob: true, pan: true, aadhar: true, email: true });
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setSuccess(true);
  };

  return (
    <div className={styles.page}>

      {/* ── Success Overlay ── */}
      {success && (
        <div className={styles.successOverlay}>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.successTitle}>Registration Successful!</div>
            <div className={styles.successSub}>Your account has been created successfully.</div>
            <button
              className={styles.successLoginBtn}
              onClick={() => { setSuccess(false); navigate("/"); }}
            >
              Login Now →
            </button>
          </div>
        </div>
      )}

      {/* ── Income Popup ── */}
      {showIncomePopup && (
        <div className={styles.overlay} onClick={() => setShowIncomePopup(false)}>
          <div className={styles.popup} onClick={e => e.stopPropagation()}>
            <div className={styles.popupHeader}>
              <span className={styles.popupTitle}>Add Income</span>
              <button className={styles.popupClose} onClick={() => setShowIncomePopup(false)}>✕</button>
            </div>
            <label className={styles.label}>LABEL</label>
            <input
              value={popupLabel}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPopupLabel(e.target.value)}
              placeholder="e.g. Rent, Salary"
              className={styles.input}
              autoFocus
            />
            <label className={styles.label}>AMOUNT</label>
            <div className={styles.amountWrapper}>
              <span className={styles.currencySymbol}>₹</span>
              <input
                value={popupAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPopupAmount(e.target.value)}
                placeholder="0"
                type="number"
                className={styles.amountInput}
              />
            </div>
            <button onClick={confirmIncome} className={styles.popupConfirmBtn}>
              + Add Income
            </button>
          </div>
        </div>
      )}

      {/* ── Expense Popup ── */}
      {showExpensePopup && (
        <div className={styles.overlay} onClick={() => setShowExpensePopup(false)}>
          <div className={styles.popup} onClick={e => e.stopPropagation()}>
            <div className={styles.popupHeader}>
              <span className={styles.popupTitle}>Add Expense</span>
              <button className={styles.popupClose} onClick={() => setShowExpensePopup(false)}>✕</button>
            </div>
            <label className={styles.label}>LABEL</label>
            <input
              value={popupLabel}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPopupLabel(e.target.value)}
              placeholder="e.g. Shop, Rent"
              className={styles.input}
              autoFocus
            />
            <label className={styles.label}>AMOUNT</label>
            <div className={styles.amountWrapper}>
              <span className={styles.currencySymbol}>₹</span>
              <input
                value={popupAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPopupAmount(e.target.value)}
                placeholder="0"
                type="number"
                className={styles.amountInput}
              />
            </div>
            <button onClick={confirmExpense} className={styles.popupConfirmBtn}>
              + Add Expense
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className={styles.header}>
        <button onClick={() => navigate("/")} className={styles.backBtn}>
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className={styles.logoSection}>
          <div className={styles.logoText}>FINADVISE</div>
          <div className={styles.logoSub}>CREATE YOUR ACCOUNT</div>
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* ── Form ── */}
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Personal Details</div>

          {/* Name */}
          <label className={styles.label}>
            FULL NAME <span className={styles.required}>*</span>
          </label>
          <div className={styles.inputWrapper}>
            <input
              value={name}
              onChange={handleNameChange}
              onBlur={() => handleBlur("name", name)}
              placeholder="Enter your full name"
              type="text"
              autoComplete="off"
              spellCheck={false}
              className={`${styles.input} ${errors.name && touched.name ? styles.inputError : ""} ${isFieldComplete("name", name) ? styles.inputSuccess : ""}`}
            />
            {isFieldComplete("name", name) && <span className={styles.checkIcon}>✓</span>}
          </div>
          {errors.name && touched.name && <div className={styles.errorMsg}>{errors.name}</div>}

          {/* DOB */}
          <label className={styles.label}>
            DATE OF BIRTH <span className={styles.required}>*</span>
          </label>
          <div className={styles.inputWrapper}>
            <input
              type="date"
              value={dob}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setDob(e.target.value);
                setErrors(err => ({ ...err, dob: "" }));
              }}
              onBlur={() => handleBlur("dob", dob)}
              className={`${styles.input} ${errors.dob && touched.dob ? styles.inputError : ""} ${isFieldComplete("dob", dob) ? styles.inputSuccess : ""}`}
            />
            {isFieldComplete("dob", dob) && <span className={styles.checkIcon}>✓</span>}
          </div>
          {errors.dob && touched.dob && <div className={styles.errorMsg}>{errors.dob}</div>}

          {/* Email */}
          <label className={styles.label}>
            EMAIL ADDRESS <span className={styles.required}>*</span>
          </label>
          <div className={styles.inputWrapper}>
            <input
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setEmail(e.target.value);
                setErrors(err => ({ ...err, email: "" }));
              }}
              onBlur={() => handleBlur("email", email)}
              placeholder="example@email.com"
              type="email"
              autoComplete="off"
              spellCheck={false}
              className={`${styles.input} ${errors.email && touched.email ? styles.inputError : ""} ${isFieldComplete("email", email) ? styles.inputSuccess : ""}`}
            />
            {isFieldComplete("email", email) && <span className={styles.checkIcon}>✓</span>}
          </div>
          {errors.email && touched.email && <div className={styles.errorMsg}>{errors.email}</div>}

          {/* PAN */}
          <label className={styles.label}>
            PAN NUMBER <span className={styles.required}>*</span>
          </label>
          <div className={styles.inputWrapper}>
            <input
              value={pan}
              onChange={handlePanChange}
              onBlur={() => handleBlur("pan", pan)}
              placeholder="ABCDE1234F"
              maxLength={10}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className={`${styles.input} ${styles.monoInput} ${errors.pan && touched.pan ? styles.inputError : ""} ${isFieldComplete("pan", pan) ? styles.inputSuccess : ""}`}
            />
            {isFieldComplete("pan", pan) && <span className={styles.checkIcon}>✓</span>}
          </div>
          {errors.pan && touched.pan && <div className={styles.errorMsg}>{errors.pan}</div>}

          {/* Aadhar */}
          <label className={styles.label}>
            AADHAR NUMBER <span className={styles.required}>*</span>
          </label>
          <div className={styles.inputWrapper}>
            <input
              value={aadhar}
              onChange={handleAadharChange}
              onBlur={() => handleBlur("aadhar", aadhar)}
              placeholder="XXXX XXXX XXXX"
              maxLength={14}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className={`${styles.input} ${styles.monoInput} ${errors.aadhar && touched.aadhar ? styles.inputError : ""} ${isFieldComplete("aadhar", aadhar) ? styles.inputSuccess : ""}`}
            />
            {isFieldComplete("aadhar", aadhar) && <span className={styles.checkIcon}>✓</span>}
          </div>
          {errors.aadhar && touched.aadhar && <div className={styles.errorMsg}>{errors.aadhar}</div>}

          {/* Annual Income */}
          <label className={styles.label}>
            ANNUAL INCOME <span className={styles.optional}>(Optional)</span>
          </label>
          <div className={styles.amountWrapper}>
            <span className={styles.currencySymbol}>₹</span>
            <input
              value={annualIncome}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAnnualIncome(e.target.value)}
              placeholder="0"
              type="number"
              className={styles.amountInput}
            />
          </div>
        </div>

        {/* ── INCOME ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Income <span className={styles.required}>*</span>
          </div>

          {incomeItems.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemInfo}>
                <div className={styles.itemLabel}>{item.label || "Income"}</div>
                <div className={styles.itemAmount}>
                  ₹{parseFloat(item.amount || "0").toLocaleString()}
                </div>
              </div>
              <div className={styles.itemActions}>
                <input
                  value={item.amount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    updateIncome(i, "amount", e.target.value);
                    setErrors(err => ({ ...err, income: "" }));
                  }}
                  placeholder="0"
                  type="number"
                  className={styles.inlineAmountInput}
                />
                <button onClick={() => removeIncome(i)} className={styles.removeBtn}>✕</button>
              </div>
            </div>
          ))}

          {errors.income && <div className={styles.errorMsg}>{errors.income}</div>}

          <div className={styles.summaryRow}>
            <div className={styles.summaryLeft}>
              <div className={styles.summaryMeta}>Total Income</div>
              <div className={styles.summaryValueGreen}>₹{totalIncome.toLocaleString()}</div>
            </div>
            <button onClick={openIncomePopup} className={styles.plusBtn}>+</button>
          </div>
        </div>

        {/* ── EXPENSES ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Expenses <span className={styles.required}>*</span>
          </div>

          {expenseItems.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemInfo}>
                <div className={styles.itemLabel}>{item.label || "Expense"}</div>
                <div className={styles.itemAmount}>
                  ₹{parseFloat(item.amount || "0").toLocaleString()}
                </div>
              </div>
              <div className={styles.itemActions}>
                <input
                  value={item.amount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    updateExpense(i, "amount", e.target.value);
                    setErrors(err => ({ ...err, expenses: "" }));
                  }}
                  placeholder="0"
                  type="number"
                  className={styles.inlineAmountInput}
                />
                <button onClick={() => removeExpense(i)} className={styles.removeBtn}>✕</button>
              </div>
            </div>
          ))}

          {errors.expenses && <div className={styles.errorMsg}>{errors.expenses}</div>}

          <div className={styles.summaryRow}>
            <div className={styles.summaryLeft}>
              <div className={styles.summaryMeta}>Total Expenses</div>
              <div className={styles.summaryValueRed}>₹{totalExpenses.toLocaleString()}</div>
            </div>
            <button onClick={openExpensePopup} className={styles.plusBtn}>+</button>
          </div>
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} className={styles.submitBtn}>
          Create Account
        </button>

        <p className={styles.loginText}>
          Already have an account?{" "}
          <span className={styles.loginLink} onClick={() => navigate("/")}>Sign In</span>
        </p>

      </div>
    </div>
  );
}