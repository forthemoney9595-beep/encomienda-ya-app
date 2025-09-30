"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type ComboboxProps = {
  options: { value: string; label: string }[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
  creatable?: boolean
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  emptyMessage = "No options found.",
  className,
  disabled,
  creatable = false
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || "")

  const handleSelect = (currentValue: string) => {
    const newValue = currentValue.toLowerCase() === value?.toLowerCase() ? "" : currentValue;
    onChange(newValue);
    setInputValue(newValue);
    setOpen(false);
  }
  
  const filteredOptions = creatable && inputValue && !options.some(opt => opt.label.toLowerCase() === inputValue.toLowerCase())
    ? [...options, { value: inputValue, label: `Crear "${inputValue}"` }]
    : options;


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          {value
            ? options.find((option) => option.value.toLowerCase() === value.toLowerCase())?.label || value
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={!creatable}>
          <CommandInput 
            placeholder={placeholder}
            onValueChange={creatable ? setInputValue : undefined}
            value={inputValue}
           />
          <CommandList>
            <CommandEmpty>{creatable ? `Presiona Enter para crear "${inputValue}"` : emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value?.toLowerCase() === option.value.toLowerCase() ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
