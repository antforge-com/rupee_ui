import React, { useState } from 'react';
import '../styles/AddAdvisor.css';
import { createAdvisor } from '../services/Addadvisor';

interface AddAdvisorProps {
  onClose: () => void;
  onSave: (advisorData: any) => void;
}

const AddAdvisor: React.FC<AddAdvisorProps> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '', // ✅ New Field: Required for Login
    designation: '',
    skills: '',
    shiftTimings: '',
    charges: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validation
    if (!formData.name || !formData.email || !formData.designation || !formData.charges) {
      setError("Please fill in Name, Email, Designation, and Charges.");
      return;
    }

    if (!formData.skills) {
      setError("Please add at least one skill.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 2. Prepare Data
      // Convert comma-separated skills string to array
      const skillsArray = formData.skills
        .split(',')
        .map(s => s.trim())
        .filter(s => s !== '');

      const consultantData = {
        name: formData.name,
        email: formData.email, // ✅ Sending Email to Backend
        designation: formData.designation,
        charges: parseFloat(formData.charges),
        shiftTimings: formData.shiftTimings,
        skills: skillsArray
      };

      console.log("Submitting Consultant Data:", consultantData);

      // 3. API Call
      const response = await createAdvisor(consultantData);
      
      onSave(response);
      onClose();
    } catch (err: any) {
      console.error('Submission Error:', err);
      
      // 4. Error Handling
      if (err.response) {
        const status = err.response.status;
        if (status === 500) {
           setError("Server Error (500). Database might be out of sync. Check backend logs.");
        } else if (status === 409) {
           setError("A Consultant with this email already exists.");
        } else {
           setError(err.response.data?.message || "Failed to save consultant.");
        }
      } else if (err.request) {
        setError("Network Error. Cannot reach the server.");
      } else {
        setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="advisor-modal-overlay">
      <div className="advisor-card">
        <div className="advisor-header">
          <h1 className="brand-title">FINADVISE</h1>
          {/* ✅ Renamed Title */}
          <p className="brand-subtitle">ADD NEW CONSULTANT</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form className="advisor-form" onSubmit={handleSubmit}>
          {/* Full Name */}
          <div className="form-group">
            <label>FULL NAME <span className="required">*</span></label>
            <input 
              type="text" name="name" placeholder="Enter consultant name" 
              value={formData.name} onChange={handleChange} disabled={loading}
            />
          </div>

          {/* ✅ Email Field (Crucial for Login) */}
          <div className="form-group">
            <label>EMAIL (LOGIN ID) <span className="required">*</span></label>
            <input 
              type="email" name="email" placeholder="e.g. name@finadvise.com" 
              value={formData.email} onChange={handleChange} disabled={loading}
            />
          </div>

          {/* Designation */}
          <div className="form-group">
            <label>DESIGNATION <span className="required">*</span></label>
            <input 
              type="text" name="designation" placeholder="e.g. Senior Tax Consultant" 
              value={formData.designation} onChange={handleChange} disabled={loading}
            />
          </div>

          {/* Skills */}
          <div className="form-group">
            <label>SKILL SET <span className="required">*</span></label>
            <input 
              type="text" name="skills" placeholder="e.g. Tax, Equity (comma separated)" 
              value={formData.skills} onChange={handleChange} disabled={loading}
            />
          </div>

          {/* Timings */}
          <div className="form-group">
            <label>SHIFT TIMINGS</label>
            <input 
              type="text" name="shiftTimings" placeholder="e.g. 9:00 AM - 6:00 PM" 
              value={formData.shiftTimings} onChange={handleChange} disabled={loading}
            />
          </div>

          {/* Charges */}
          <div className="form-group">
            <label>CHARGE PER SESSION (₹) <span className="required">*</span></label>
            <input 
              type="number" name="charges" placeholder="0" 
              value={formData.charges} onChange={handleChange} disabled={loading}
              min="0" step="0.01"
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn-save" disabled={loading}>
              {/* ✅ Renamed Button */}
              {loading ? 'Adding...' : 'Add Consultant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAdvisor;