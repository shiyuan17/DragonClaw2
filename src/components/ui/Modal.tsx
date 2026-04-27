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

import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

interface ModalProps {
    /** Whether the modal is visible */
    show: boolean;
    /** Called when the overlay is clicked (optional — omit to disable overlay close) */
    onClose?: () => void;
    /** Modal title (displayed at top) */
    title?: string;
    /** Maximum width of the modal box (default: 480px) */
    maxWidth?: number;
    /** Modal content */
    children: ReactNode;
}

export function Modal({ show, onClose, title, maxWidth = 480, children }: ModalProps) {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className="modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="modal-box"
                        style={{ maxWidth }}
                        onClick={(e) => e.stopPropagation()}
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
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
