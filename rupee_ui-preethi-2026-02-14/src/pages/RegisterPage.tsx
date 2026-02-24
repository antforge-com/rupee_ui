import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/RegisterPage.module.css";

interface IncomeItem { label: string; amount: string; }
interface ExpenseItem { label: string; amount: string; }

// Subscription Plan Data
const PLANS = [
  { 
    id: "elite", 
    name: "Elite", 
    originalPrice: "2999", 
    discountPrice: "999", 
    features: "Tax Optimization + Pro + Live Support",
    tag: "BEST VALUE"
  },
  { 
    id: "pro", 
    name: "Pro", 
    originalPrice: "1499", 
    discountPrice: "499", 
    features: "Expert consultations & Portfolio" 
  },
  { 
    id: "free", 
    name: "Free", 
    originalPrice: "0", 
    discountPrice: "0", 
    features: "Basic portfolio tracking" 
  },
];

export default function RegisterPage() {
  const navigate = useNavigate();

  // Core Form State
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [identifier, setIdentifier] = useState(""); // Combined PAN/Aadhar
  const [annualIncome, setAnnualIncome] = useState("");

  // --- NEW: Subscription State (Defaulting to Elite) ---
  const [selectedPlan, setSelectedPlan] = useState("elite");

  // Lists State
  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([{ label: "Rent Amount", amount: "" }]);
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([{ label: "Shop", amount: "1000" }]);

  // Popup Management
  const [showIncomePopup, setShowIncomePopup] = useState(false);
  const [showExpensePopup, setShowExpensePopup] = useState(false);
  const [popupLabel, setPopupLabel] = useState("");
  const [popupAmount, setPopupAmount] = useState("");

  // Status State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  // --- Handlers ---
  const openIncomePopup = () => { setPopupLabel(""); setPopupAmount(""); setShowIncomePopup(true); };
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

  const updateIncome = (index: number, field: keyof IncomeItem, value: string) =>
    setIncomeItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  
  const updateExpense = (index: number, field: keyof ExpenseItem, value: string) =>
    setExpenseItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));

  const removeIncome = (index: number) => setIncomeItems(i => i.filter((_, idx) => idx !== index));
  const removeExpense = (index: number) => setExpenseItems(e => e.filter((_, idx) => idx !== index));

  const totalIncome = incomeItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const totalExpenses = expenseItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  // --- Validation Logic ---
  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = "Full name is required";
    if (!dob) newErrors.dob = "Date of birth is required";

    const cleanId = identifier.replace(/\s/g, "").toUpperCase();
    const isPan = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanId);
    const isAadhar = /^\d{12}$/.test(cleanId);

    if (!identifier.trim()) {
      newErrors.identifier = "PAN or Aadhar number is required";
    } else if (!isPan && !isAadhar) {
      newErrors.identifier = "Invalid format. Enter 10-char PAN or 12-digit Aadhar";
    }

    if (incomeItems.every(item => !item.amount)) newErrors.income = "Add at least one income amount";
    if (expenseItems.every(item => !item.amount)) newErrors.expenses = "Add at least one expense amount";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setSuccess(true);
    
    // Optional: Save subscription info to localStorage
    localStorage.setItem("user_plan", selectedPlan);

    setTimeout(() => {
      setSuccess(false);
      navigate("/");
    }, 2500);
  };

  return (
    <div className={styles.page}>
      {/* Success Notification */}
      {success && (
        <div className={styles.successOverlay}>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.successTitle}>Registration Successful!</div>
            <div className={styles.successSub}>Redirecting to login...</div>
          </div>
        </div>
      )}

      {/* Header */}
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

      {/* Shared Popup Component Logic */}
      {(showIncomePopup || showExpensePopup) && (
        <div className={styles.overlay} onClick={() => { setShowIncomePopup(false); setShowExpensePopup(false); }}>
          <div className={styles.popup} onClick={e => e.stopPropagation()}>
            <div className={styles.popupHeader}>
              <span className={styles.popupTitle}>{showIncomePopup ? "Add Income" : "Add Expense"}</span>
              <button className={styles.popupClose} onClick={() => { setShowIncomePopup(false); setShowExpensePopup(false); }}>✕</button>
            </div>
            <label className={styles.label}>LABEL</label>
            <input
              value={popupLabel}
              onChange={(e) => setPopupLabel(e.target.value)}
              placeholder="e.g. Salary, Rent, Grocery"
              className={styles.input}
              autoFocus
            />
            <label className={styles.label}>AMOUNT</label>
            <div className={styles.amountWrapper}>
              <span className={styles.currencySymbol}>₹</span>
              <input
                value={popupAmount}
                onChange={(e) => setPopupAmount(e.target.value)}
                placeholder="0"
                type="number"
                className={styles.amountInput}
              />
            </div>
            <button onClick={showIncomePopup ? confirmIncome : confirmExpense} className={styles.popupConfirmBtn}>
              + Add {showIncomePopup ? "Income" : "Expense"}
            </button>
          </div>
        </div>
      )}

      <div className={styles.content}>
        {/* PERSONAL DETAILS SECTION */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Personal Details</div>

          <label className={styles.label}>FULL NAME <span className={styles.required}>*</span></label>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors(err => ({ ...err, name: "" })); }}
            placeholder="Enter your full name"
            className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
          />
          {errors.name && <div className={styles.errorMsg}>{errors.name}</div>}

          <label className={styles.label}>DATE OF BIRTH <span className={styles.required}>*</span></label>
          <input
            type="date"
            value={dob}
            onChange={(e) => { setDob(e.target.value); setErrors(err => ({ ...err, dob: "" })); }}
            className={`${styles.input} ${errors.dob ? styles.inputError : ""}`}
          />
          {errors.dob && <div className={styles.errorMsg}>{errors.dob}</div>}

          <label className={styles.label}>IDENTIFIER (PAN OR AADHAR) <span className={styles.required}>*</span></label>
          <input
            value={identifier}
            onChange={(e) => { setIdentifier(e.target.value); setErrors(err => ({ ...err, identifier: "" })); }}
            placeholder="PAN (ABCDE1234F) or 12-digit Aadhar"
            className={`${styles.input} ${errors.identifier ? styles.inputError : ""}`}
          />
          {errors.identifier && <div className={styles.errorMsg}>{errors.identifier}</div>}

          <label className={styles.label}>ANNUAL INCOME <span className={styles.optional}>(Optional)</span></label>
          <div className={styles.amountWrapper}>
            <span className={styles.currencySymbol}>₹</span>
            <input
              value={annualIncome}
              onChange={(e) => setAnnualIncome(e.target.value)}
              placeholder="0"
              type="number"
              className={styles.amountInput}
            />
          </div>
        </div>

        {/* INCOME SECTION */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Income <span className={styles.required}>*</span></div>
          {incomeItems.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemInfo}>
                <div className={styles.itemLabel}>{item.label || "Income"}</div>
                <div className={styles.itemAmount}>₹{parseFloat(item.amount || "0").toLocaleString()}</div>
              </div>
              <div className={styles.itemActions}>
                <input
                  value={item.amount}
                  onChange={(e) => { updateIncome(i, "amount", e.target.value); setErrors(err => ({ ...err, income: "" })); }}
                  placeholder="0" type="number" className={styles.inlineAmountInput}
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

        {/* EXPENSES SECTION */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Expenses <span className={styles.required}>*</span></div>
          {expenseItems.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemInfo}>
                <div className={styles.itemLabel}>{item.label || "Expense"}</div>
                <div className={styles.itemAmount}>₹{parseFloat(item.amount || "0").toLocaleString()}</div>
              </div>
              <div className={styles.itemActions}>
                <input
                  value={item.amount}
                  onChange={(e) => { updateExpense(i, "amount", e.target.value); setErrors(err => ({ ...err, expenses: "" })); }}
                  placeholder="0" type="number" className={styles.inlineAmountInput}
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

        {/* --- NEW: SUBSCRIPTION PLANS SECTION --- */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Select Subscription Plan</div>
          <div className={styles.planGrid}>
            {PLANS.map((plan) => (
              <div 
                key={plan.id} 
                className={`${styles.planCard} ${selectedPlan === plan.id ? styles.selectedPlan : ""}`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                <div className={styles.planInfo}>
                  <div className={styles.planNameRow}>
                    <span className={styles.planName}>{plan.name}</span>
                    {plan.tag && <span className={styles.planTag}>{plan.tag}</span>}
                  </div>
                  <div className={styles.planFeatures}>{plan.features}</div>
                </div>
                
                <div className={styles.planPriceInfo}>
                  <div className={styles.priceColumn}>
                    {plan.discountPrice !== plan.originalPrice && (
                        <span className={styles.originalPrice}>₹{plan.originalPrice}</span>
                    )}
                    <span className={styles.discountPrice}>₹{plan.discountPrice}</span>
                  </div>
                  <div className={styles.radioCircle}>
                    {selectedPlan === plan.id && <div className={styles.radioInner} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSubmit} className={styles.submitBtn}>
          {selectedPlan === "free" ? "Create Account" : `Subscribe & Create Account (₹${PLANS.find(p => p.id === selectedPlan)?.discountPrice})`}
        </button>
        <p className={styles.loginText}>
          Already have an account? <span className={styles.loginLink} onClick={() => navigate("/login")}>Sign In</span>
        </p>
      </div>
    </div>
  );
}