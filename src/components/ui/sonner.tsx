import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      mobileOffset={{
        bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        left: "1rem",
        right: "1rem",
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast !pointer-events-none group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          closeButton: "!pointer-events-auto",
          actionButton:
            "!pointer-events-auto group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "!pointer-events-auto group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
