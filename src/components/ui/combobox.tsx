"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandGroup,
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
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selecciona una opción...",
  emptyMessage = "No se encontraron opciones.",
  className,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const currentOption = options.find((option) => option.value.toLowerCase() === value?.toLowerCase())

  const handleSelect = (selectedValue: string) => {
    const option = options.find(opt => opt.label.toLowerCase() === selectedValue.toLowerCase());
    onChange(option ? option.value : selectedValue);
    setOpen(false);
    setSearch(option ? option.label : selectedValue);
  }
  
  React.useEffect(() => {
    if (value) {
      const option = options.find(opt => opt.value.toLowerCase() === value.toLowerCase());
      setSearch(option ? option.label : value);
    } else {
      setSearch("");
    }
  }, [value, options]);

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
          <span className="truncate">
            {currentOption ? currentOption.label : value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
            onBlur={() => {
                // If the user tabs away, commit the current search text as the new value
                if (search && (!currentOption || search !== currentOption.label)) {
                    onChange(search);
                }
            }}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options
                .filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()))
                .map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
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
