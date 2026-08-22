import React from 'react';
import { Dialog, Portal, CloseButton } from '@chakra-ui/react';
import DiscoverPage from './DiscoverPage';

interface DiscoverModalProps {
  /** Search query to pre-fill and auto-run; the modal is open whenever this
   * is non-null, closed when it's null. */
  query: string | null;
  onClose: () => void;
}

/** Renders the Discover/search page inside a dialog so a user can find and
 * queue a torrent without navigating away from whatever they were browsing —
 * see useDiscoverModal() for the paired state hook. */
const DiscoverModal: React.FC<DiscoverModalProps> = ({ query, onClose }) => (
  <Dialog.Root
    open={query !== null}
    onOpenChange={d => { if (!d.open) onClose(); }}
    placement="center"
    motionPreset="slide-in-bottom"
  >
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="1500px" width="95vw" maxH="85vh" overflow="hidden">
          <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" position="absolute" top={2} right={2} zIndex={1} />
          </Dialog.CloseTrigger>
          <Dialog.Body p={4} overflow="hidden" height="80vh">
            {query !== null && (
              <DiscoverPage initialQuery={query} embedded onAdded={onClose} />
            )}
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);

export default DiscoverModal;
