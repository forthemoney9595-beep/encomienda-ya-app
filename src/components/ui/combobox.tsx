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
  const [query, setQuery] = React.useState("")

  const handleSelect = (currentValue: string) => {
    onChange(currentValue)
    setOpen(false)
  }

  const currentOption = options.find((option) => option.value.toLowerCase() === value?.toLowerCase())

  const filteredOptions = query
    ? options.filter((option) =>
        option.label.toLowerCase().includes(query.toLowerCase())
      )
    : options

  const displayedOptions =
    creatable && query && !filteredOptions.some(opt => opt.label.toLowerCase() === query.toLowerCase())
      ? [...filteredOptions, { value: query, label: `Crear "${query}"` }]
      : filteredOptions;


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
          {currentOption ? currentOption.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{creatable && query ? `Presiona Enter para crear "${query}"` : emptyMessage}</CommandEmpty>
            <CommandGroup>
              {displayedOptions.map((option) => (
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
