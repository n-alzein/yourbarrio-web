"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  Suspense,
  useState,
} from "react";
import { createPortal } from "react-dom";
import CustomerLoginModal from "./CustomerLoginModal";
import CustomerSignupModal from "./CustomerSignupModal";
import ModalRouterClient from "@/components/auth/ModalRouterClient";
import { AUTH_UI_RESET_EVENT } from "@/components/AuthProvider";
import { shouldSuppressAuthUiReset } from "@/lib/auth/loginErrors";

const ModalContext = createContext(null);

const MODAL_COMPONENTS = {
  "customer-login": CustomerLoginModal,
  "customer-signup": CustomerSignupModal,
};

const MODAL_ALIASES = {
  signin: "customer-login",
  login: "customer-login",
  signup: "customer-signup",
};

function resolveModalType(type) {
  if (!type || typeof type !== "string") return null;
  const normalized = type.trim().toLowerCase();
  if (!normalized) return null;
  return MODAL_ALIASES[normalized] || normalized;
}

function getModalRoot() {
  if (typeof document === "undefined") return null;
  let root = document.getElementById("modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "modal-root";
    document.body.appendChild(root);
  }
  return root;
}

export default function ModalProviderClient({ children }) {
  const [modal, setModal] = useState({ type: null, props: {} });
  const [modalRoot] = useState(() => getModalRoot());

  const closeModal = useCallback(() => {
    setModal({ type: null, props: {} });
  }, []);

  const openModal = useCallback((type, props = {}) => {
    const resolvedType = resolveModalType(type);
    if (!resolvedType || !MODAL_COMPONENTS[resolvedType]) return;
    setModal({ type: resolvedType, props });
  }, []);

  useEffect(() => {
    if (!modal.type) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [modal.type, closeModal]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleReset = () => {
      if (shouldSuppressAuthUiReset()) return;
      closeModal();
    };
    window.addEventListener(AUTH_UI_RESET_EVENT, handleReset);
    return () => window.removeEventListener(AUTH_UI_RESET_EVENT, handleReset);
  }, [closeModal]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (modal.type) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [modal.type]);

  const value = useMemo(
    () => ({
      openModal,
      closeModal,
      activeModal: modal.type,
    }),
    [openModal, closeModal, modal.type]
  );

  const ModalComponent = modal.type ? MODAL_COMPONENTS[modal.type] : null;
  return (
    <ModalContext.Provider value={value}>
      <Suspense fallback={null}>
        <ModalRouterClient openModal={openModal} />
      </Suspense>
      {children}
      {ModalComponent && modalRoot
        ? createPortal(
            <Suspense fallback={null}>
              <ModalComponent {...modal.props} onClose={closeModal} />
            </Suspense>,
            modalRoot
          )
        : null}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}
