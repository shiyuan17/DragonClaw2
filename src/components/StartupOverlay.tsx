// Copyright (C) 2026 shiyuan
// SPDX-License-Identifier: GPL-3.0-only
// This file is part of DragonClaw. See LICENSE for details.
/**
 * StartupOverlay Component
 *
 * Full-screen loading overlay shown while the OpenClaw service is starting up.
 * Displays logo + spinning animation + status text.
 * Dismissed when the service emits a "ready" signal (browser opens).
 */

import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import logo from "../assets/dragonclaw-logo.png";

interface StartupOverlayProps {
    show: boolean;
}

export function StartupOverlay({ show }: StartupOverlayProps) {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className="startup-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="startup-overlay-content">
                        <div className="startup-overlay-eyebrow">DRAGONCLAW</div>
                        <div className="startup-overlay-stage">
                            <img src={logo} alt="DragonClaw" className="startup-overlay-logo" />
                        </div>
                        <Loader2 className="startup-overlay-spinner" size={28} strokeWidth={1.5} />
                        <div className="startup-overlay-text">正在启动 OpenClaw 服务...</div>
                        <div className="startup-overlay-hint">服务就绪后将自动打开浏览器</div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
