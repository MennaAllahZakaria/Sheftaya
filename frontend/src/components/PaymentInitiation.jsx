import React, { useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import "./PaymentInitiation.css";

const PaymentInitiation = () => {
  const { jobId } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [paymentData, setPaymentData] = useState(null);

  const handleInitiatePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        `/api/payments/jobs/${jobId}/initiate`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (response.data.status === "success") {
        setPaymentData(response.data.data);
        setSuccess(true);

        // Redirect to Paymob payment page after 2 seconds
        setTimeout(() => {
          window.location.href = response.data.data.paymentLink;
        }, 2000);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Failed to initiate payment. Please try again."
      );
      console.error("Payment initiation error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="payment-initiation-container">
      <div className="payment-card">
        <h2>تأكيد الدفع</h2>

        {error && <div className="alert alert-error">{error}</div>}

        {success && (
          <div className="alert alert-success">
            <p>تم إنشاء طلب الدفع بنجاح!</p>
            <p>جاري التحويل إلى صفحة الدفع...</p>
          </div>
        )}

        {paymentData && (
          <div className="payment-details">
            <div className="detail-row">
              <span className="label">المبلغ:</span>
              <span className="value">{paymentData.amount} جنيه</span>
            </div>
            <div className="detail-row">
              <span className="label">رقم الطلب:</span>
              <span className="value">{paymentData.orderId}</span>
            </div>
          </div>
        )}

        {!success && (
          <button
            onClick={handleInitiatePayment}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? "جاري المعالجة..." : "ابدأ الدفع"}
          </button>
        )}
      </div>
    </div>
  );
};

export default PaymentInitiation;
