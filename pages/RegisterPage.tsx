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

  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([
    { label: "Rent Amount", amount: "" },
  ]);

  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([
    { label: "Shop", amount: "1000" },
  ]);

  const addIncome  = () => setIncomeItems(i => [...i, { label: "", amount: "" }]);
  const addExpense = () => setExpenseItems(e => [...e, { label: "", amount: "" }]);

  const updateIncome = (index: number, field: keyof IncomeItem, value: string) => {
    setIncomeItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const updateExpense = (index: number, field: keyof ExpenseItem, value: string) => {
    setExpenseItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeIncome  = (index: number) => setIncomeItems(i => i.filter((_, idx) => idx !== index));
  const removeExpense = (index: number) => setExpenseItems(e => e.filter((_, idx) => idx !== index));

  const totalIncome   = incomeItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const totalExpenses = expenseItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const handleSubmit = () => navigate("/user");

  return (
    <div className={styles.page}>

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

        {/* PERSONAL DETAILS */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Personal Details</div>

          <label className={styles.label}>FULL NAME</label>
          <input
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder="Enter your full name"
            className={styles.input}
          />

          <label className={styles.label}>DATE OF BIRTH</label>
          <input
            type="date"
            value={dob}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDob(e.target.value)}
            className={styles.input}
          />

          <label className={styles.label}>PAN NUMBER</label>
          <input
            value={pan}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPan(e.target.value.toUpperCase())}
            placeholder="ABCDE1234F"
            maxLength={10}
            className={styles.input}
          />

          <label className={styles.label}>AADHAR NUMBER</label>
          <input
            value={aadhar}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setAadhar(e.target.value)}
            placeholder="XXXX XXXX XXXX"
            maxLength={14}
            className={styles.input}
          />

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
          <div className={styles.sectionTitle}>Income</div>

          {incomeItems.map((item, i) => (
            <div key={i} className={styles.itemRow}>

              {/* Label input */}
              <input
                value={item.label}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateIncome(i, "label", e.target.value)}
                placeholder="Label (e.g. Rent)"
                className={styles.itemLabelInput}
              />

              {/* Amount input */}
              <div className={styles.qtyWrapper}>
                <span className={styles.rupeeIcon}>₹</span>
                <input
                  value={item.amount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateIncome(i, "amount", e.target.value)}
                  placeholder="Amount"
                  type="number"
                  className={styles.qtyInput}
                />
              </div>

              {/* + or ✕ button */}
              {i === incomeItems.length - 1 ? (
                <button onClick={addIncome} className={styles.plusBtn}>+</button>
              ) : (
                <button onClick={() => removeIncome(i)} className={styles.removeBtn}>✕</button>
              )}
            </div>
          ))}

          {/* Income Summary */}
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#94A3B8"/>
                </svg>
                Total Income
              </span>
              <span className={styles.summaryValueGreen}>
                ₹{totalIncome.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* ── EXPENSES ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Expenses</div>

          {expenseItems.map((item, i) => (
            <div key={i} className={styles.itemRow}>

              {/* Label input */}
              <input
                value={item.label}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateExpense(i, "label", e.target.value)}
                placeholder="Label (e.g. Shop)"
                className={styles.itemLabelInput}
              />

              {/* Amount input */}
              <div className={styles.qtyWrapper}>
                <span className={styles.rupeeIcon}>₹</span>
                <input
                  value={item.amount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateExpense(i, "amount", e.target.value)}
                  placeholder="Amount"
                  type="number"
                  className={styles.qtyInput}
                />
              </div>

              {/* + or ✕ button */}
              {i === expenseItems.length - 1 ? (
                <button onClick={addExpense} className={styles.plusBtn}>+</button>
              ) : (
                <button onClick={() => removeExpense(i)} className={styles.removeBtn}>✕</button>
              )}
            </div>
          ))}

          {/* Expenses Summary */}
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#94A3B8"/>
                </svg>
                Total Expenses
              </span>
              <span className={styles.summaryValueRed}>
                ₹{totalExpenses.toLocaleString()}
              </span>
            </div>
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
