"use client";

import { ReactNode, useEffect, useState } from "react";
import { Drawer } from "vaul";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useIsMobile } from "@/utils/useIsMobile";

interface Props {
    /** Whether something is selected and the panel should be shown. */
    open: boolean;
    /** Accessible title (used by the mobile drawer). */
    title: string;
    /**
     * Identifies the currently selected entity. When it changes the panel
     * un-retracts and (on mobile) snaps back to mid — so picking another
     * train/station always brings the fresh content into view.
     */
    selectionKey: string | number | null;
    onClose: () => void;
    children: ReactNode;
}

// Mobile snap points as fractions of viewport height: peek / mid / full.
const SNAP_POINTS: (number | string)[] = [0.2, 0.55, 0.92];

const closeButtonStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: 0,
    borderRadius: 18,
    cursor: "pointer",
    color: "#666",
    flexShrink: 0,
};

/**
 * The single sliding panel that shows the details of whatever is selected on
 * the map — a train or a station. Desktop: slides in from the right, over the
 * map; a retract toggle collapses it to a thin tab. Mobile: a vaul bottom sheet
 * with peek / mid / full snap points. Content is supplied by the caller, so the
 * same shell serves both entity types and only one instance ever exists.
 */
export default function DetailPanel({
    open,
    title,
    selectionKey,
    onClose,
    children,
}: Props) {
    const isMobile = useIsMobile();
    const [retracted, setRetracted] = useState(false);
    const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[1]);

    // A new selection always brings the panel back into view.
    useEffect(() => {
        if (open) {
            setRetracted(false);
            setSnap(SNAP_POINTS[1]);
        }
    }, [open, selectionKey]);

    if (isMobile) {
        return (
            <Drawer.Root
                open={open}
                onOpenChange={(o) => !o && onClose()}
                snapPoints={SNAP_POINTS}
                activeSnapPoint={snap}
                setActiveSnapPoint={setSnap}
                modal={false}
            >
                <Drawer.Portal>
                    <Drawer.Content
                        aria-describedby={undefined}
                        style={{
                            position: "fixed",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            zIndex: 50,
                            background: "var(--bg, #fff)",
                            color: "var(--fg, #000)",
                            borderTopLeftRadius: 16,
                            borderTopRightRadius: 16,
                            boxShadow:
                                "0 -8px 24px rgba(0,0,0,0.15), 0 -2px 8px rgba(0,0,0,0.08)",
                            height: "92vh",
                            display: "flex",
                            flexDirection: "column",
                            outline: "none",
                        }}
                    >
                        <Drawer.Title style={{ display: "none" }}>
                            {title}
                        </Drawer.Title>
                        {/* Drag handle + close */}
                        <div
                            style={{
                                position: "relative",
                                flexShrink: 0,
                                padding: "8px 0 4px",
                            }}
                        >
                            <div
                                style={{
                                    width: 40,
                                    height: 4,
                                    borderRadius: 4,
                                    background: "rgba(0,0,0,0.2)",
                                    margin: "0 auto",
                                }}
                            />
                            <button
                                onClick={onClose}
                                aria-label="Close"
                                style={{
                                    ...closeButtonStyle,
                                    position: "absolute",
                                    top: 4,
                                    right: 8,
                                }}
                            >
                                <X size={18} weight="bold" />
                            </button>
                        </div>
                        <div
                            style={{
                                flex: 1,
                                overflowY: "auto",
                                padding: "0 16px 24px",
                                WebkitOverflowScrolling: "touch",
                            }}
                        >
                            {children}
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        );
    }

    // Desktop: a fixed panel over the right edge of the map.
    const hidden = !open || retracted;
    return (
        <>
            {/* Re-open tab — visible only while the panel is retracted. */}
            <button
                onClick={() => setRetracted(false)}
                aria-label="Expand panel"
                style={{
                    position: "fixed",
                    top: "50%",
                    right: 0,
                    transform: "translateY(-50%)",
                    zIndex: 49,
                    width: 26,
                    height: 64,
                    display: open && retracted ? "flex" : "none",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg, #fff)",
                    color: "#666",
                    border: 0,
                    borderTopLeftRadius: 10,
                    borderBottomLeftRadius: 10,
                    boxShadow: "-2px 0 10px rgba(0,0,0,0.18)",
                    cursor: "pointer",
                }}
            >
                <CaretLeft size={16} weight="bold" />
            </button>

            <div
                aria-hidden={hidden}
                style={{
                    position: "fixed",
                    top: 70,
                    right: 12,
                    bottom: 12,
                    width: 384,
                    maxWidth: "calc(100vw - 24px)",
                    zIndex: 50,
                    background: "var(--bg, #fff)",
                    color: "var(--fg, #000)",
                    borderRadius: 14,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    transform: hidden
                        ? "translateX(calc(100% + 24px))"
                        : "translateX(0)",
                    opacity: open ? 1 : 0,
                    transition: "transform 0.3s ease, opacity 0.3s ease",
                    pointerEvents: hidden ? "none" : "auto",
                }}
            >
                {/* Control bar: retract + close. */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 2,
                        padding: "6px 6px 0",
                        flexShrink: 0,
                    }}
                >
                    <button
                        onClick={() => setRetracted(true)}
                        aria-label="Retract panel"
                        title="Retract"
                        style={closeButtonStyle}
                    >
                        <CaretRight size={16} weight="bold" />
                    </button>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={closeButtonStyle}
                    >
                        <X size={18} weight="bold" />
                    </button>
                </div>
                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "0 16px 20px",
                    }}
                >
                    {children}
                </div>
            </div>
        </>
    );
}
