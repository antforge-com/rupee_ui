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
  const [annualIncome, setAnnualIncome] = useState("");

  const [incomeItems, setIncomeItems]   = useState<IncomeItem[]>([{ label: "Rent Amount", amount: "" }]);
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([{ label: "Shop", amount: "1000" }]);

  // Popup state
  const [showIncomePopup, setShowIncomePopup]   = useState(false);
  const [showExpensePopup, setShowExpensePopup] = useState(false);
  const [popupLabel, setPopupLabel]             = useState("");
  const [popupAmount, setPopupAmount]           = useState("");

  // Validation & success
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const openIncomePopup  = () => { setPopupLabel(""); setPopupAmount(""); setShowIncomePopup(true); };
  const openExpensePopup = () => { setPopupLabel(""); setPopupAmount(""); setShowExpensePopup(true); };

  const confirmIncome = () => {
    if (popupLabel.trim() || popupAmount.trim()) {
      setIncomeItems(i => [...i, { label: popupLabel, amount: popupAmount }]);
    }
    setShowIncomePopup(false);
  };

  const confirmExpense = () => {
    if (popupLabel.trim() || popupAmount.trim()) {
      setExpenseItems(e => [...e, { label: popupLabel, amount: popupAmount }]);
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

  // ── Validation ──
  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim())
      newErrors.name = "Full name is required";

    if (!dob)
      newErrors.dob = "Date of birth is required";

    if (!pan.trim())
      newErrors.pan = "PAN number is required";
    else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan))
      newErrors.pan = "Invalid PAN format (e.g. ABCDE1234F)";

    if (!aadhar.trim())
      newErrors.aadhar = "Aadhar number is required";
    else if (aadhar.replace(/\s/g, "").length !== 12)
      newErrors.aadhar = "Aadhar must be 12 digits";

    if (incomeItems.every(item => !item.amount))
      newErrors.income = "Please add at least one income amount";

    if (expenseItems.every(item => !item.amount))
      newErrors.expenses = "Please add at least one expense amount";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    // Show success toast then redirect
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      navigate("/");
    }, 2500);
  };

  return (
    <div className={styles.page}>

      {/* ── Success Toast ── */}
      {success && (
        <div className={styles.successOverlay}>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.successTitle}>Registration Successful!</div>
            <div className={styles.successSub}>Redirecting to login...</div>
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

      {/* ── Form ── */}
      <div className={styles.content}>

        {/* PERSONAL DETAILS */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Personal Details</div>

          {/* Name */}
          <label className={styles.label}>
            FULL NAME <span className={styles.required}>*</span>
          </label>
          <input
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { setName(e.target.value); setErrors(err => ({ ...err, name: "" })); }}
            placeholder="Enter your full name"
            className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
          />
          {errors.name && <div className={styles.errorMsg}>{errors.name}</div>}

          {/* DOB */}
          <label className={styles.label}>
            DATE OF BIRTH <span className={styles.required}>*</span>
          </label>
          <input
            type="date"
            value={dob}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { setDob(e.target.value); setErrors(err => ({ ...err, dob: "" })); }}
            className={`${styles.input} ${errors.dob ? styles.inputError : ""}`}
          />
          {errors.dob && <div className={styles.errorMsg}>{errors.dob}</div>}

          {/* PAN */}
          <label className={styles.label}>
            PAN NUMBER <span className={styles.required}>*</span>
          </label>
          <input
            value={pan}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { setPan(e.target.value.toUpperCase()); setErrors(err => ({ ...err, pan: "" })); }}
            placeholder="ABCDE1234F"
            maxLength={10}
            className={`${styles.input} ${errors.pan ? styles.inputError : ""}`}
          />
          {errors.pan && <div className={styles.errorMsg}>{errors.pan}</div>}

          {/* Aadhar */}
          <label className={styles.label}>
            AADHAR NUMBER <span className={styles.required}>*</span>
          </label>
          <input
            value={aadhar}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { setAadhar(e.target.value); setErrors(err => ({ ...err, aadhar: "" })); }}
            placeholder="XXXX XXXX XXXX"
            maxLength={14}
            className={`${styles.input} ${errors.aadhar ? styles.inputError : ""}`}
          />
          {errors.aadhar && <div className={styles.errorMsg}>{errors.aadhar}</div>}

          {/* Annual Income - Optional */}
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
                <div className={styles.itemAmount}>₹{parseFloat(item.amount || "0").toLocaleString()}</div>
              </div>
              <div className={styles.itemActions}>
                <input
                  value={item.amount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => { updateIncome(i, "amount", e.target.value); setErrors(err => ({ ...err, income: "" })); }}
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
                <div className={styles.itemAmount}>₹{parseFloat(item.amount || "0").toLocaleString()}</div>
              </div>
              <div className={styles.itemActions}>
                <input
                  value={item.amount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => { updateExpense(i, "amount", e.target.value); setErrors(err => ({ ...err, expenses: "" })); }}
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
