import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";

type FileDragEvent = DragEvent | ReactDragEvent<HTMLElement>;

const FILE_DRAG_TYPES = new Set(["files", "application/x-moz-file", "text/uri-list", "public.file-url"]);
const PLAIN_TEXT_DRAG_TYPES = new Set(["text/plain", "text/html"]);

function getDataTransferTypes(dataTransfer: DataTransfer | null | undefined) {
  return dataTransfer ? Array.from(dataTransfer.types ?? []).map((type) => type.toLowerCase()) : [];
}

function eventHasFilePayload(event: FileDragEvent) {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return false;
  }

  if (dataTransfer.files.length > 0) {
    return true;
  }

  if (dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items).some((item) => item.kind === "file");
  }

  return getDataTransferTypes(dataTransfer).some((type) => FILE_DRAG_TYPES.has(type));
}

function isPotentialFileDrag(event: FileDragEvent) {
  if (eventHasFilePayload(event)) {
    return true;
  }

  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return false;
  }

  const types = getDataTransferTypes(dataTransfer);
  if (types.length === 0) {
    return true;
  }

  return !types.every((type) => PLAIN_TEXT_DRAG_TYPES.has(type));
}

function isPointInsideElement(element: HTMLElement | null, clientX: number, clientY: number) {
  if (!element) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function hasLeftViewport(event: DragEvent) {
  return (
    event.clientX <= 0
    || event.clientY <= 0
    || event.clientX >= window.innerWidth
    || event.clientY >= window.innerHeight
  );
}

type WorkspaceComposerFileDropOptions = {
  disabled: boolean;
  onDropFiles: (files: File[]) => void | Promise<void>;
};

export function useWorkspaceComposerFileDrop({ disabled, onDropFiles }: WorkspaceComposerFileDropOptions) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isDragActiveRef = useRef(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const updateDragState = (nextValue: boolean) => {
    if (isDragActiveRef.current === nextValue) {
      return;
    }
    isDragActiveRef.current = nextValue;
    setIsDragActive(nextValue);
  };

  const resetDragState = () => {
    updateDragState(false);
  };

  useEffect(() => {
    if (disabled) {
      resetDragState();
    }
  }, [disabled]);

  useEffect(() => {
    const listenerOptions = { capture: true };

    const resolveDragTargetInsideRoot = (event: DragEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (target instanceof Node && root?.contains(target)) {
        return true;
      }
      return isPointInsideElement(root, event.clientX, event.clientY);
    };

    const handleWindowDragOver = (event: DragEvent) => {
      if (!isPotentialFileDrag(event)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }

      if (disabled) {
        resetDragState();
        return;
      }

      updateDragState(resolveDragTargetInsideRoot(event));
    };

    const handleWindowDrop = (event: DragEvent) => {
      if (!isPotentialFileDrag(event)) {
        return;
      }
      event.preventDefault();

      const droppedInsideRoot = resolveDragTargetInsideRoot(event);
      const files = Array.from(event.dataTransfer?.files ?? []);
      resetDragState();
      if (!disabled && droppedInsideRoot && files.length > 0) {
        void onDropFiles(files);
      }
    };

    const handleWindowDragLeave = (event: DragEvent) => {
      if (!isPotentialFileDrag(event) || !hasLeftViewport(event)) {
        return;
      }
      resetDragState();
    };

    const handleWindowDragEnd = () => {
      resetDragState();
    };

    window.addEventListener("dragover", handleWindowDragOver, listenerOptions);
    window.addEventListener("drop", handleWindowDrop, listenerOptions);
    window.addEventListener("dragleave", handleWindowDragLeave, listenerOptions);
    window.addEventListener("dragend", handleWindowDragEnd, listenerOptions);
    return () => {
      window.removeEventListener("dragover", handleWindowDragOver, listenerOptions);
      window.removeEventListener("drop", handleWindowDrop, listenerOptions);
      window.removeEventListener("dragleave", handleWindowDragLeave, listenerOptions);
      window.removeEventListener("dragend", handleWindowDragEnd, listenerOptions);
    };
  }, [disabled, onDropFiles]);

  const handleDragEnter = (event: ReactDragEvent<HTMLElement>) => {
    if (disabled || !isPotentialFileDrag(event)) {
      return;
    }
    event.preventDefault();
    updateDragState(true);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (disabled || !isPotentialFileDrag(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    updateDragState(true);
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (disabled || !isPotentialFileDrag(event)) {
      return;
    }
    event.preventDefault();

    const root = rootRef.current;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && root?.contains(nextTarget)) {
      return;
    }

    if (!isPointInsideElement(root, event.clientX, event.clientY)) {
      resetDragState();
    }
  };

  return {
    rootRef,
    isDragActive,
    rootDragProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
    },
    resetDragState,
  };
}
