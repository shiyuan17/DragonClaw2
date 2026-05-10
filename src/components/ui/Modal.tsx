/**
 * Reusable Modal Component
 *
 * Wraps content in an animated overlay + centered box.
 * All modals in the app should use this component for consistent
 * animations, styling, and behavior.
 *
 * Usage:
 *   <Modal show={showMyModal} onClose={() => setShowMyModal(false)} title="My Title" maxWidth={420}>
 *     <p>Modal content goes here</p>
 *   </Modal>
 */

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface ModalProps {
    /** Whether the modal is visible */
    show: boolean;
    /** Called when the overlay is clicked (optional - omit to disable overlay close) */
    onClose?: () => void;
    /** Modal title (displayed at top) */
    title?: string;
    /** Maximum width of the modal box (default: 480px) */
    maxWidth?: number;
    /** Optional extra class for the overlay */
    overlayClassName?: string;
    /** Optional extra class for the modal box */
    contentClassName?: string;
    /** Modal content */
    children: ReactNode;
}

export function Modal({
    show,
    onClose,
    title,
    maxWidth = 480,
    overlayClassName = "",
    contentClassName = "",
    children,
}: ModalProps) {
    const prefersReducedMotion = useReducedMotion();
    const overlayTransition = { duration: prefersReducedMotion ? 0 : 0.14, ease: [0.4, 0, 0.2, 1] as const };
    const contentTransition = { duration: prefersReducedMotion ? 0 : 0.16, ease: [0.2, 0, 0, 1] as const };

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className={["modal-overlay", overlayClassName].join(" ").trim()}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={overlayTransition}
                    onClick={onClose}
                >
                    <motion.div
                        className={["modal-box", contentClassName].join(" ").trim()}
                        style={{ maxWidth }}
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                        transition={contentTransition}
                    >
                        {title && <div className="modal-title">{title}</div>}
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/**
 * Modal footer with action buttons
 * Provides consistent spacing and alignment for modal action buttons.
 */
interface ModalFooterProps {
    children: ReactNode;
}

export function ModalFooter({ children }: ModalFooterProps) {
    return (
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            {children}
        </div>
    );
}
