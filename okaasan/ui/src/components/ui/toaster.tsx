import {
  Toaster as ChakraToaster,
  Portal,
  Toast,
  createToaster,
} from '@chakra-ui/react';

export const toaster = createToaster({
  placement: 'bottom-end',
  pauseOnPageIdle: true,
});

export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster}>
        {(toast) => (
          <Toast.Root padding="3" minH="unset" minW="280px" width="auto" maxW="420px">
            <Toast.Title fontSize="sm" lineClamp={2}>{toast.title}</Toast.Title>
            {toast.description && <Toast.Description fontSize="xs">{toast.description}</Toast.Description>}
            <Toast.CloseTrigger position="absolute" top="1" insetEnd="1" />
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}

function toast(type: 'success' | 'error' | 'info' | 'warning', message: string) {
  toaster.create({
    title: message,
    type,
    duration: type === 'error' ? 6000 : 3000,
  });
}

const _stable = { toast } as const;

export function useToast() {
  return _stable;
}
