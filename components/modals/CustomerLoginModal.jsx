"use client";

import BaseModal from "./BaseModal";
import { useModal } from "./ModalProvider";
import CustomerLoginForm from "@/components/auth/CustomerLoginForm";
import { clearAuthIntent } from "@/lib/auth/authIntent";

export default function CustomerLoginModal({
  onClose,
  next: nextFromModalProps = null,
  onSuccess = null,
  onCancel = null,
}) {
  const { openModal } = useModal();
  if (process.env.NODE_ENV !== "production") {
    console.info("[auth-next] modal received next:", nextFromModalProps || "/");
  }
  const handleClose = ({ canceled = true } = {}) => {
    clearAuthIntent();
    if (canceled) onCancel?.();
    onClose?.();
  };

  return (
    <BaseModal
      title="Welcome back"
      description="Sign in to your customer account to continue exploring nearby businesses."
      onClose={() => handleClose()}
    >
      <CustomerLoginForm
        next={nextFromModalProps}
        onSuccess={(...args) => {
          handleClose({ canceled: false });
          onSuccess?.(...args);
        }}
        onSwitchToSignup={() => openModal("customer-signup")}
      />
    </BaseModal>
  );
}
