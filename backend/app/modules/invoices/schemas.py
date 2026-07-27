"""Pydantic schémata pro faktury."""
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator

from backend.app.modules.invoices.document_types import DEFAULT_DOCUMENT_KIND, normalize_document_kind

BusinessMode = Literal["autoservice", "construction"]
TaxMode = Literal["standard", "reverse_charge"]
StoredInvoiceStatus = Literal["draft", "issued", "cancelled"]
EffectiveInvoiceStatus = Literal["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"]
InvoicePaymentStatus = Literal["unpaid", "partially_paid", "paid", "not_payable"]
StoredExpenseStatus = Literal["open", "cancelled"]
EffectiveExpenseStatus = Literal["open", "partially_paid", "paid", "overdue", "cancelled"]
InvoiceTodoType = Literal[
    "invoice_overdue",
    "invoice_payment_reminder",
    "expense_due",
    "expense_overdue",
    "manual",
]
InvoiceTodoStatus = Literal["open", "completed", "cancelled"]
BankTransactionDirection = Literal["incoming", "outgoing"]
BankTransactionStatus = Literal["imported", "matched", "ignored"]
PaymentMatchType = Literal["variable_symbol_amount", "variable_symbol_only", "amount_only", "manual"]
PaymentMatchStatus = Literal["suggested", "applied", "rejected"]
RecurringTemplateType = Literal["invoice", "expense"]
RecurringTemplateStatus = Literal["active", "paused", "cancelled"]
RecurringInterval = Literal["daily", "weekly", "monthly", "quarterly", "yearly"]
RecurringGenerationStatus = Literal["generated", "failed"]
InvoiceReminderType = Literal["invoice_overdue", "invoice_payment_reminder", "manual"]
InvoiceReminderEmailStatus = Literal["prepared", "sent", "failed"]
InvoiceAttachmentType = Literal[
    "invoice_document",
    "expense_document",
    "todo_note",
    "bank_transaction",
    "payment_proof",
    "other",
]
InvoiceAttachmentStatus = Literal["uploaded", "linked", "archived"]
AccountingEventSource = Literal[
    "admin_api",
    "system",
    "import",
    "generation",
    "email",
    "bank_matching",
    "ai_accounting",
]


class InvoiceItemCreate(BaseModel):
    description: str = Field(min_length=1, max_length=512)
    quantity: Decimal
    unit_price: Decimal

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Vyplňte popis položky.")
        return cleaned

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Množství položky musí být větší než nula.")
        return value

    @field_validator("unit_price")
    @classmethod
    def validate_unit_price(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Jednotková cena nemůže být záporná.")
        return value


class InvoiceCreate(BaseModel):
    invoice_number: str | None = Field(default=None, min_length=1, max_length=9)
    document_kind: str = DEFAULT_DOCUMENT_KIND
    status: StoredInvoiceStatus = "issued"
    issue_date: date
    due_date: date

    subject_id: int | None = Field(default=None)
    customer_name: str | None = Field(default=None, min_length=1, max_length=256)
    customer_email: str | None = Field(default=None, min_length=1, max_length=256)
    customer_phone: str | None = Field(default=None, max_length=64)
    customer_address: str | None = Field(default=None, max_length=256)
    customer_ico: str | None = Field(default=None, max_length=32)
    customer_dic: str | None = Field(default=None, max_length=32)

    note: str | None = None
    payment_method: str | None = Field(default=None, max_length=64)

    business_mode: BusinessMode
    tax_mode: TaxMode
    currency: str = Field(default="CZK", min_length=3, max_length=8)
    vat_rate: Decimal | None = None

    items: list[InvoiceItemCreate]

    @field_validator("subject_id")
    @classmethod
    def validate_subject_id(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value <= 0:
            raise ValueError("ID subjektu musí být kladné číslo.")
        return value

    @field_validator("customer_name", "customer_email", "customer_address")
    @classmethod
    def validate_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Toto pole je povinné.")
        return cleaned

    @field_validator("invoice_number")
    @classmethod
    def validate_invoice_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if not cleaned.isdigit():
            raise ValueError("Číslo faktury může obsahovat pouze číslice.")
        if len(cleaned) > 9:
            raise ValueError("Číslo faktury může mít maximálně 9 číslic.")
        if int(cleaned) <= 0:
            raise ValueError("Číslo faktury musí být větší než nula.")
        return cleaned

    @field_validator("document_kind")
    @classmethod
    def validate_document_kind(cls, value: str | None) -> str:
        return normalize_document_kind(value)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: StoredInvoiceStatus | None) -> StoredInvoiceStatus | None:
        return value

    @field_validator("customer_phone", "customer_ico", "customer_dic", "note", "payment_method")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("vat_rate")
    @classmethod
    def validate_vat_rate(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value < 0:
            raise ValueError("Sazba DPH nemůže být záporná.")
        return value

    @field_validator("items")
    @classmethod
    def validate_items(cls, value: list[InvoiceItemCreate]) -> list[InvoiceItemCreate]:
        if not value:
            raise ValueError("Faktura musí obsahovat alespoň jednu položku.")
        return value

    @model_validator(mode="after")
    def validate_dates_and_modes(self) -> "InvoiceCreate":
        if self.due_date < self.issue_date:
            raise ValueError("Datum splatnosti nemůže být dříve než datum vystavení.")
        if self.tax_mode == "standard" and self.vat_rate is None:
            raise ValueError("Pro běžný režim DPH musíte vyplnit sazbu DPH.")
        if self.subject_id is None:
            missing_fields = [
                field_name
                for field_name, field_value in (
                    ("customer_name", self.customer_name),
                    ("customer_email", self.customer_email),
                    ("customer_address", self.customer_address),
                )
                if field_value is None
            ]
            if missing_fields:
                raise ValueError("Bez subject_id musíte vyplnit customer_name, customer_email a customer_address.")
        return self


class InvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal

    @field_serializer("quantity", "unit_price", "line_total", when_used="json")
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InvoicePaymentCreate(BaseModel):
    amount: Decimal
    paid_at: date
    payment_method: str = Field(min_length=1, max_length=64)
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Částka platby musí být větší než nula.")
        return value

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Způsob platby je povinný.")
        return cleaned

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoicePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    amount: Decimal
    paid_at: date
    payment_method: str
    note: str | None
    created_at: datetime

    @field_serializer("amount", when_used="json")
    def serialize_amount(self, value: Decimal) -> float:
        return float(value)


class InvoiceSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    variable_symbol: str
    document_kind: str
    issue_date: date
    due_date: date

    issuer_name: str
    issuer_address: str
    issuer_city: str
    issuer_zip: str
    issuer_ico: str
    issuer_dic: str
    issuer_data_box: str | None

    customer_name: str
    customer_email: str
    customer_phone: str | None
    customer_address: str | None
    customer_ico: str | None
    customer_dic: str | None
    subject_id: int | None

    note: str | None

    business_mode: BusinessMode
    tax_mode: TaxMode
    currency: str
    subtotal: Decimal
    vat_rate: Decimal | None
    vat_amount: Decimal
    total: Decimal
    status: str
    total_paid: Decimal
    remaining_amount: Decimal
    payment_status: InvoicePaymentStatus
    effective_status: EffectiveInvoiceStatus

    reverse_charge_reason: str | None
    reverse_charge_text: str | None
    payment_method: str
    bank_account_number: str
    bank_account_prefix: str | None
    bank_code: str
    bank_iban: str

    created_at: datetime

    @field_serializer(
        "subtotal",
        "vat_rate",
        "vat_amount",
        "total",
        "total_paid",
        "remaining_amount",
        when_used="json",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return float(value)


class InvoiceDetailResponse(InvoiceSummaryResponse):
    items: list[InvoiceItemResponse]
    payments: list[InvoicePaymentResponse]


class InvoiceUpdate(InvoiceCreate):
    document_kind: str | None = None
    status: StoredInvoiceStatus | None = None

    @field_validator("document_kind")
    @classmethod
    def validate_optional_document_kind(cls, value: str | None) -> str | None:
        return normalize_document_kind(value, default_to_invoice=False)


class AresCompanyLookupResponse(BaseModel):
    ico: str
    dic: str | None
    company_name: str
    address_line: str
    city: str
    zip: str
    country: str
    data_box: str | None
    source: Literal["ares", "mock_ares"]


class InvoiceSendEmailRequest(BaseModel):
    to_email: str | None = Field(default=None, max_length=256)

    @field_validator("to_email")
    @classmethod
    def normalize_to_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceSendEmailResponse(BaseModel):
    ok: Literal[True]
    invoice_id: int
    invoice_number: str
    sent_to: str
    copied_to: list[str] = Field(default_factory=list)


class InvoiceReminderEmailPreviewResponse(BaseModel):
    invoice_id: int
    invoice_number: str
    todo_id: int | None
    reminder_type: InvoiceReminderType
    recipient_email: str
    subject: str
    message: str


class InvoiceReminderEmailSendRequest(BaseModel):
    to_email: str | None = Field(default=None, max_length=256)
    todo_id: int | None = Field(default=None, ge=1)
    subject: str | None = Field(default=None, max_length=256)
    message: str | None = Field(default=None, max_length=4000)

    @field_validator("to_email", "subject", "message")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceReminderEmailSendResponse(BaseModel):
    ok: Literal[True]
    reminder_email_id: int
    invoice_id: int
    invoice_number: str
    todo_id: int | None
    reminder_type: InvoiceReminderType
    sent_to: str
    copied_to: list[str] = Field(default_factory=list)
    status: InvoiceReminderEmailStatus


class InvoiceReminderEmailLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    todo_id: int | None
    reminder_type: InvoiceReminderType
    status: InvoiceReminderEmailStatus
    recipient_email: str
    subject: str
    message: str
    sent_at: datetime | None
    error_message: str | None
    created_at: datetime


class InvoiceAttachmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int | None
    expense_id: int | None
    todo_id: int | None
    bank_transaction_id: int | None
    attachment_type: InvoiceAttachmentType
    status: InvoiceAttachmentStatus
    original_filename: str
    content_type: str
    size_bytes: int
    checksum_sha256: str | None
    note: str | None
    created_at: datetime


class InvoiceAttachmentLinkRequest(BaseModel):
    invoice_id: int | None = Field(default=None, ge=1)
    expense_id: int | None = Field(default=None, ge=1)
    todo_id: int | None = Field(default=None, ge=1)
    bank_transaction_id: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_at_least_one_link(self) -> "InvoiceAttachmentLinkRequest":
        if (
            self.invoice_id is None
            and self.expense_id is None
            and self.todo_id is None
            and self.bank_transaction_id is None
        ):
            raise ValueError("Vyplňte alespoň jeden cíl pro navázání přílohy.")
        return self


class InvoiceAttachmentArchiveResponse(BaseModel):
    ok: Literal[True]
    attachment_id: int
    status: InvoiceAttachmentStatus


class InvoiceAttachmentDeleteResponse(BaseModel):
    ok: Literal[True]
    attachment_id: int


class InvoiceAccountingEventResponse(BaseModel):
    id: int
    event_type: str
    entity_type: str
    entity_id: int
    invoice_id: int | None
    expense_id: int | None
    subject_id: int | None
    supplier_id: int | None
    bank_transaction_id: int | None
    payment_match_id: int | None
    todo_id: int | None
    attachment_id: int | None
    recurring_template_id: int | None
    reminder_email_id: int | None
    actor_type: str | None
    actor_id: int | None
    actor_email: str | None
    source: AccountingEventSource
    message: str | None
    old_values: dict[str, Any] | list[Any] | str | None
    new_values: dict[str, Any] | list[Any] | str | None
    metadata: dict[str, Any] | list[Any] | str | None
    created_at: datetime


class InvoiceSubjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    email: str = Field(min_length=1, max_length=256)
    phone: str | None = Field(default=None, max_length=64)
    address: str = Field(min_length=1, max_length=256)
    ico: str | None = Field(default=None, max_length=32)
    dic: str | None = Field(default=None, max_length=32)
    data_box: str | None = Field(default=None, max_length=64)
    country: str | None = Field(default=None, max_length=128)
    note: str | None = None

    @field_validator("name", "email", "address")
    @classmethod
    def validate_required_subject_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Toto pole je povinné.")
        return cleaned

    @field_validator("phone", "ico", "dic", "data_box", "country", "note")
    @classmethod
    def normalize_optional_subject_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceSubjectCreate(InvoiceSubjectBase):
    pass


class InvoiceSubjectUpdate(InvoiceSubjectBase):
    pass


class InvoiceSubjectResponse(InvoiceSubjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class InvoiceSubjectDeleteResponse(BaseModel):
    ok: Literal[True]
    subject_id: int


class InvoiceSupplierBase(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    email: str = Field(min_length=1, max_length=256)
    phone: str | None = Field(default=None, max_length=64)
    address: str = Field(min_length=1, max_length=256)
    ico: str | None = Field(default=None, max_length=32)
    dic: str | None = Field(default=None, max_length=32)
    data_box: str | None = Field(default=None, max_length=64)
    country: str | None = Field(default=None, max_length=128)
    note: str | None = None

    @field_validator("name", "email", "address")
    @classmethod
    def validate_required_supplier_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Toto pole je povinné.")
        return cleaned

    @field_validator("phone", "ico", "dic", "data_box", "country", "note")
    @classmethod
    def normalize_optional_supplier_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceSupplierCreate(InvoiceSupplierBase):
    pass


class InvoiceSupplierUpdate(InvoiceSupplierBase):
    pass


class InvoiceSupplierResponse(InvoiceSupplierBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class InvoiceSupplierDeleteResponse(BaseModel):
    ok: Literal[True]
    supplier_id: int


class InvoiceBankTransactionImportItem(BaseModel):
    external_id: str | None = Field(default=None, max_length=256)
    account_iban: str | None = Field(default=None, max_length=34)
    account_number: str | None = Field(default=None, max_length=32)
    bank_code: str | None = Field(default=None, max_length=16)
    transaction_date: date
    booked_date: date | None = None
    amount: Decimal
    currency: str = Field(min_length=1, max_length=8)
    variable_symbol: str | None = Field(default=None, max_length=32)
    constant_symbol: str | None = Field(default=None, max_length=32)
    specific_symbol: str | None = Field(default=None, max_length=32)
    counterparty_name: str | None = Field(default=None, max_length=256)
    counterparty_account: str | None = Field(default=None, max_length=64)
    counterparty_iban: str | None = Field(default=None, max_length=34)
    message: str | None = None
    direction: BankTransactionDirection
    raw_payload: dict[str, Any] | list[Any] | str | None = None

    @field_validator("amount")
    @classmethod
    def validate_positive_amount(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Částka transakce musí být větší než nula.")
        return value

    @field_validator("currency")
    @classmethod
    def normalize_transaction_currency(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if not cleaned:
            raise ValueError("Měna je povinná.")
        return cleaned

    @field_validator(
        "external_id",
        "account_iban",
        "account_number",
        "bank_code",
        "variable_symbol",
        "constant_symbol",
        "specific_symbol",
        "counterparty_name",
        "counterparty_account",
        "counterparty_iban",
        "message",
    )
    @classmethod
    def normalize_optional_transaction_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceBankTransactionImportRequest(BaseModel):
    transactions: list[InvoiceBankTransactionImportItem]

    @field_validator("transactions")
    @classmethod
    def validate_transactions_not_empty(
        cls, value: list[InvoiceBankTransactionImportItem]
    ) -> list[InvoiceBankTransactionImportItem]:
        if not value:
            raise ValueError("Import musí obsahovat alespoň jednu transakci.")
        return value


class InvoiceBankTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    external_id: str | None
    account_iban: str | None
    account_number: str | None
    bank_code: str | None
    transaction_date: date
    booked_date: date | None
    amount: Decimal
    currency: str
    variable_symbol: str | None
    constant_symbol: str | None
    specific_symbol: str | None
    counterparty_name: str | None
    counterparty_account: str | None
    counterparty_iban: str | None
    message: str | None
    raw_payload: str | None
    direction: BankTransactionDirection
    status: BankTransactionStatus
    created_at: datetime
    updated_at: datetime

    @field_serializer("amount", when_used="json")
    def serialize_transaction_amount(self, value: Decimal) -> float:
        return float(value)


class InvoiceBankTransactionImportResponse(BaseModel):
    imported_count: int
    skipped_duplicate_count: int
    imported_transaction_ids: list[int] = Field(default_factory=list)
    skipped_duplicate_identifiers: list[str] = Field(default_factory=list)


class InvoiceBankTransactionIgnoreResponse(BaseModel):
    ok: Literal[True]
    transaction_id: int
    status: BankTransactionStatus


class PayableInvoiceForBankMatchingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    document_kind: str
    customer_name: str
    issue_date: date
    due_date: date
    currency: str
    total: Decimal
    remaining_amount: Decimal
    payment_status: InvoicePaymentStatus
    effective_status: EffectiveInvoiceStatus

    @field_serializer("total", "remaining_amount", when_used="json")
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InvoiceBankTransactionAssignInvoiceRequest(BaseModel):
    invoice_id: int = Field(gt=0)


class InvoiceBankTransactionRecordInvoicePaymentRequest(BaseModel):
    invoice_id: int = Field(gt=0)
    transaction_date: date
    amount: Decimal | None = None
    message: str | None = Field(default=None, max_length=4000)
    counterparty_name: str | None = Field(default=None, max_length=256)

    @field_validator("amount")
    @classmethod
    def validate_optional_positive_amount(cls, value: Decimal | None) -> Decimal | None:
        if value is None:
            return None
        if value <= 0:
            raise ValueError("Částka platby musí být větší než nula.")
        return value

    @field_validator("message", "counterparty_name")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceBankTransactionRecordInvoicePaymentResponse(BaseModel):
    transaction_id: int
    match_id: int
    invoice_id: int
    invoice_number: str
    payment_status: InvoicePaymentStatus
    total_paid: Decimal
    remaining_amount: Decimal
    transaction_status: BankTransactionStatus

    @field_serializer("total_paid", "remaining_amount", when_used="json")
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InvoicePaymentMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bank_transaction_id: int
    invoice_id: int | None
    expense_id: int | None
    invoice_payment_id: int | None
    expense_payment_id: int | None
    match_type: PaymentMatchType
    confidence: int
    status: PaymentMatchStatus
    reason: str | None
    created_at: datetime
    applied_at: datetime | None


class InvoicePaymentMatchBankTransactionSummary(BaseModel):
    id: int
    transaction_date: date
    booked_date: date | None
    amount: Decimal
    currency: str
    direction: BankTransactionDirection
    variable_symbol: str | None
    message: str | None
    status: BankTransactionStatus
    counterparty_name: str | None

    @field_serializer("amount", when_used="json")
    def serialize_transaction_amount(self, value: Decimal) -> float:
        return float(value)


class InvoicePaymentMatchCandidateSummary(BaseModel):
    invoice_id: int | None
    expense_id: int | None
    document_number: str | None
    variable_symbol: str | None
    counterparty_name: str | None
    total: Decimal | None
    remaining_amount: Decimal | None
    currency: str | None

    @field_serializer("total", "remaining_amount", when_used="json")
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return float(value)


class InvoicePaymentMatchListItemResponse(InvoicePaymentMatchResponse):
    bank_transaction: InvoicePaymentMatchBankTransactionSummary
    candidate: InvoicePaymentMatchCandidateSummary


class InvoiceRecurringTemplateItemCreate(InvoiceItemCreate):
    pass


class InvoiceRecurringTemplateItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal

    @field_serializer("quantity", "unit_price", "line_total", when_used="json")
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InvoiceRecurringTemplateBase(BaseModel):
    template_type: RecurringTemplateType
    document_kind: str | None = None
    subject_id: int | None = Field(default=None, ge=1)
    supplier_id: int | None = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=256)
    status: RecurringTemplateStatus = "active"
    recurrence_interval: RecurringInterval
    recurrence_count: int = Field(ge=1, le=365)
    next_run_date: date
    business_mode: BusinessMode | None = None
    tax_mode: TaxMode | None = None
    currency: str = Field(default="CZK", min_length=3, max_length=8)
    vat_rate: Decimal | None = None
    note: str | None = None
    payment_method: str | None = Field(default=None, max_length=64)
    bank_account_number: str | None = Field(default=None, max_length=32)
    bank_account_prefix: str | None = Field(default=None, max_length=16)
    bank_code: str | None = Field(default=None, max_length=16)
    bank_iban: str | None = Field(default=None, max_length=34)
    items: list[InvoiceRecurringTemplateItemCreate]

    @field_validator("document_kind")
    @classmethod
    def normalize_optional_recurring_document_kind(cls, value: str | None) -> str | None:
        return normalize_document_kind(value, default_to_invoice=False)

    @field_validator("name")
    @classmethod
    def validate_recurring_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Název šablony je povinný.")
        return cleaned

    @field_validator("currency")
    @classmethod
    def normalize_recurring_currency(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if not cleaned:
            raise ValueError("Měna je povinná.")
        return cleaned

    @field_validator("vat_rate")
    @classmethod
    def validate_recurring_vat_rate(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value < 0:
            raise ValueError("Sazba DPH nemůže být záporná.")
        return value

    @field_validator(
        "note",
        "payment_method",
        "bank_account_number",
        "bank_account_prefix",
        "bank_code",
        "bank_iban",
    )
    @classmethod
    def normalize_optional_recurring_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("items")
    @classmethod
    def validate_recurring_items(
        cls, value: list[InvoiceRecurringTemplateItemCreate]
    ) -> list[InvoiceRecurringTemplateItemCreate]:
        if not value:
            raise ValueError("Šablona musí obsahovat alespoň jednu položku.")
        return value

    @model_validator(mode="after")
    def validate_recurring_template_rules(self) -> "InvoiceRecurringTemplateBase":
        if self.template_type == "invoice":
            if self.document_kind not in {"invoice", "proforma"}:
                raise ValueError("Recurring invoice template podporuje pouze document_kind invoice nebo proforma.")
            if self.subject_id is None:
                raise ValueError("Recurring invoice/proforma template vyžaduje subject_id.")
            if self.supplier_id is not None:
                raise ValueError("Recurring invoice template nesmí používat supplier_id.")
            if self.business_mode is None:
                raise ValueError("Recurring invoice/proforma template vyžaduje business_mode.")
            if self.tax_mode is None:
                raise ValueError("Recurring invoice/proforma template vyžaduje tax_mode.")
        else:
            if self.document_kind is not None:
                raise ValueError("Recurring expense template nesmí obsahovat document_kind.")
            if self.subject_id is not None:
                raise ValueError("Recurring expense template nesmí používat subject_id.")
            if self.supplier_id is None:
                raise ValueError("Recurring expense template vyžaduje supplier_id.")
            if self.business_mode is not None:
                raise ValueError("Recurring expense template nesmí obsahovat business_mode.")
            if self.tax_mode is not None:
                raise ValueError("Recurring expense template nesmí obsahovat tax_mode.")
            if self.payment_method is None or self.bank_account_number is None or self.bank_code is None:
                raise ValueError(
                    "Recurring expense template vyžaduje payment_method, bank_account_number a bank_code."
                )

        if any(
            value is not None
            for value in (self.payment_method, self.bank_account_number, self.bank_account_prefix, self.bank_code, self.bank_iban)
        ):
            if self.payment_method is None or self.bank_account_number is None or self.bank_code is None:
                raise ValueError(
                    "Pokud recurring template obsahuje platební override, musí vyplnit payment_method, bank_account_number a bank_code."
                )
        return self


class InvoiceRecurringTemplateCreate(InvoiceRecurringTemplateBase):
    pass


class InvoiceRecurringTemplateUpdate(InvoiceRecurringTemplateBase):
    pass


class InvoiceRecurringGenerationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: int
    generated_invoice_id: int | None
    generated_expense_id: int | None
    generated_at: datetime
    run_date: date
    status: RecurringGenerationStatus
    message: str | None


class InvoiceRecurringTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_type: RecurringTemplateType
    document_kind: str | None
    subject_id: int | None
    supplier_id: int | None
    name: str
    status: RecurringTemplateStatus
    recurrence_interval: RecurringInterval
    recurrence_count: int
    next_run_date: date
    last_run_date: date | None
    business_mode: BusinessMode | None
    tax_mode: TaxMode | None
    currency: str
    vat_rate: Decimal | None
    note: str | None
    payment_method: str | None
    bank_account_number: str | None
    bank_account_prefix: str | None
    bank_code: str | None
    bank_iban: str | None
    created_at: datetime
    updated_at: datetime
    items: list[InvoiceRecurringTemplateItemResponse]

    @field_serializer("vat_rate", when_used="json")
    def serialize_vat_rate(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return float(value)


class InvoiceRecurringTemplateDeleteResponse(BaseModel):
    ok: Literal[True]
    template_id: int


class QuoteConvertRequest(BaseModel):
    target_document_kind: Literal["invoice", "proforma"]
    issue_date: date | None = None
    due_date: date | None = None
    note: str | None = None

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_dates(self) -> "QuoteConvertRequest":
        if self.issue_date is not None and self.due_date is not None and self.due_date < self.issue_date:
            raise ValueError("Datum splatnosti nemůže být dříve než datum vystavení.")
        return self


class InvoiceExpenseItemCreate(InvoiceItemCreate):
    pass


class InvoiceExpenseItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal

    @field_serializer("quantity", "unit_price", "line_total", when_used="json")
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class InvoiceExpensePaymentCreate(BaseModel):
    amount: Decimal
    paid_at: date
    payment_method: str = Field(min_length=1, max_length=64)
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Částka platby musí být větší než nula.")
        return value

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Způsob platby je povinný.")
        return cleaned

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceExpensePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_id: int
    amount: Decimal
    paid_at: date
    payment_method: str
    note: str | None
    created_at: datetime

    @field_serializer("amount", when_used="json")
    def serialize_amount(self, value: Decimal) -> float:
        return float(value)


class InvoiceExpenseBase(BaseModel):
    expense_number: str | None = Field(default=None, min_length=1, max_length=9)
    supplier_id: int | None = Field(default=None, ge=1)
    supplier_name: str | None = Field(default=None, min_length=1, max_length=256)
    supplier_email: str | None = Field(default=None, min_length=1, max_length=256)
    supplier_phone: str | None = Field(default=None, max_length=64)
    supplier_address: str | None = Field(default=None, min_length=1, max_length=256)
    supplier_ico: str | None = Field(default=None, max_length=32)
    supplier_dic: str | None = Field(default=None, max_length=32)
    supplier_data_box: str | None = Field(default=None, max_length=64)
    supplier_country: str | None = Field(default=None, max_length=128)
    issue_date: date
    received_date: date
    due_date: date
    taxable_supply_date: date
    currency: str = Field(default="CZK", min_length=3, max_length=8)
    vat_rate: Decimal | None = None
    note: str | None = None
    payment_method: str = Field(min_length=1, max_length=64)
    bank_account_number: str = Field(min_length=1, max_length=32)
    bank_account_prefix: str | None = Field(default=None, max_length=16)
    bank_code: str = Field(min_length=1, max_length=16)
    bank_iban: str | None = Field(default=None, max_length=34)
    items: list[InvoiceExpenseItemCreate]

    @field_validator("expense_number")
    @classmethod
    def validate_expense_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if not cleaned.isdigit():
            raise ValueError("Číslo přijatého dokladu může obsahovat pouze číslice.")
        if len(cleaned) > 9:
            raise ValueError("Číslo přijatého dokladu může mít maximálně 9 číslic.")
        if int(cleaned) <= 0:
            raise ValueError("Číslo přijatého dokladu musí být větší než nula.")
        return cleaned

    @field_validator(
        "payment_method",
        "bank_account_number",
        "bank_code",
    )
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Toto pole je povinné.")
        return cleaned

    @field_validator(
        "supplier_name",
        "supplier_email",
        "supplier_phone",
        "supplier_address",
        "supplier_ico",
        "supplier_dic",
        "supplier_data_box",
        "supplier_country",
        "note",
        "bank_account_prefix",
        "bank_iban",
    )
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("vat_rate")
    @classmethod
    def validate_vat_rate(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value < 0:
            raise ValueError("Sazba DPH nemůže být záporná.")
        return value

    @field_validator("items")
    @classmethod
    def validate_items(cls, value: list[InvoiceExpenseItemCreate]) -> list[InvoiceExpenseItemCreate]:
        if not value:
            raise ValueError("Přijatý doklad musí obsahovat alespoň jednu položku.")
        return value

    @model_validator(mode="after")
    def validate_dates(self) -> "InvoiceExpenseBase":
        if self.due_date < self.issue_date:
            raise ValueError("Datum splatnosti nemůže být dříve než datum vystavení.")
        if self.received_date < self.issue_date:
            raise ValueError("Datum přijetí nemůže být dříve než datum vystavení.")
        if self.supplier_id is None:
            if not self.supplier_name:
                raise ValueError("Vyplňte název dodavatele nebo zvolte supplier_id.")
            if not self.supplier_email:
                raise ValueError("Vyplňte email dodavatele nebo zvolte supplier_id.")
            if not self.supplier_address:
                raise ValueError("Vyplňte adresu dodavatele nebo zvolte supplier_id.")
        return self


class InvoiceExpenseCreate(InvoiceExpenseBase):
    status: StoredExpenseStatus = "open"


class InvoiceExpenseUpdate(InvoiceExpenseBase):
    status: StoredExpenseStatus = "open"


class InvoiceExpenseSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_number: str
    variable_symbol: str
    supplier_id: int | None
    supplier_name: str
    supplier_email: str
    supplier_phone: str | None
    supplier_address: str
    supplier_ico: str | None
    supplier_dic: str | None
    supplier_data_box: str | None
    supplier_country: str | None
    issue_date: date
    received_date: date
    due_date: date
    taxable_supply_date: date
    currency: str
    subtotal: Decimal
    vat_rate: Decimal | None
    vat_amount: Decimal
    total: Decimal
    status: EffectiveExpenseStatus = Field(validation_alias="effective_status")
    note: str | None
    payment_method: str
    bank_account_number: str
    bank_account_prefix: str | None
    bank_code: str
    bank_iban: str | None
    total_paid: Decimal
    remaining_amount: Decimal
    payment_status: InvoicePaymentStatus
    created_at: datetime
    updated_at: datetime

    @field_serializer(
        "subtotal",
        "vat_rate",
        "vat_amount",
        "total",
        "total_paid",
        "remaining_amount",
        when_used="json",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        if value is None:
            return None
        return float(value)


class InvoiceExpenseDetailResponse(InvoiceExpenseSummaryResponse):
    items: list[InvoiceExpenseItemResponse]
    payments: list[InvoiceExpensePaymentResponse]


class InvoiceExpenseDeleteResponse(BaseModel):
    ok: Literal[True]
    expense_id: int


class InvoiceTodoCreate(BaseModel):
    invoice_id: int | None = None
    expense_id: int | None = None
    todo_type: InvoiceTodoType = "manual"
    status: InvoiceTodoStatus = "open"
    title: str = Field(min_length=1, max_length=256)
    message: str | None = Field(default=None, max_length=4000)
    due_date: date

    @field_validator("invoice_id", "expense_id")
    @classmethod
    def validate_optional_positive_id(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value <= 0:
            raise ValueError("ID musí být kladné číslo.")
        return value

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Název todo je povinný.")
        return cleaned

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_links(self) -> "InvoiceTodoCreate":
        if self.invoice_id is not None and self.expense_id is not None:
            raise ValueError("Todo může být navázáno buď na fakturu, nebo na výdaj, ne na obojí.")
        if self.todo_type.startswith("invoice_") and self.invoice_id is None:
            raise ValueError("Pro tento typ todo musíte vyplnit invoice_id.")
        if self.todo_type.startswith("expense_") and self.expense_id is None:
            raise ValueError("Pro tento typ todo musíte vyplnit expense_id.")
        return self


class InvoiceTodoUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    message: str | None = Field(default=None, max_length=4000)
    due_date: date
    status: InvoiceTodoStatus

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Název todo je povinný.")
        return cleaned

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceTodoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int | None
    expense_id: int | None
    todo_type: InvoiceTodoType
    status: InvoiceTodoStatus
    title: str
    message: str | None
    due_date: date
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class InvoiceTodoDeleteResponse(BaseModel):
    ok: Literal[True]
    todo_id: int


class InvoiceTodoGenerateResponse(BaseModel):
    ok: Literal[True]
    generated_count: int
    skipped_existing_count: int
    generated_ids: list[int]


InvoiceDocumentRelationType = Literal[
    "tax_document_for_payment",
    "final_invoice_for_proforma",
    "correction_for_invoice",
    "invoice_from_quote",
    "proforma_from_quote",
]


class InvoiceRelationDocumentSummaryResponse(BaseModel):
    id: int
    document_kind: str
    invoice_number: str
    variable_symbol: str
    issue_date: date
    due_date: date
    customer_name: str
    currency: str
    total: Decimal
    effective_status: EffectiveInvoiceStatus
    payment_status: InvoicePaymentStatus

    @field_serializer("total", when_used="json")
    def serialize_total(self, value: Decimal) -> float:
        return float(value)


class InvoiceRelationPaymentSummaryResponse(BaseModel):
    id: int
    amount: Decimal
    paid_at: date
    payment_method: str
    note: str | None

    @field_serializer("amount", when_used="json")
    def serialize_amount(self, value: Decimal) -> float:
        return float(value)


class InvoiceDocumentRelationResponse(BaseModel):
    id: int
    relation_type: InvoiceDocumentRelationType
    source_invoice_id: int
    target_invoice_id: int
    source_payment_id: int | None
    created_at: datetime
    source_document: InvoiceRelationDocumentSummaryResponse | None
    target_document: InvoiceRelationDocumentSummaryResponse | None
    source_payment: InvoiceRelationPaymentSummaryResponse | None


class InvoiceRelationsSummaryResponse(BaseModel):
    invoice_id: int
    outgoing_relations: list[InvoiceDocumentRelationResponse]
    incoming_relations: list[InvoiceDocumentRelationResponse]
    all_relations: list[InvoiceDocumentRelationResponse]


class FinalInvoiceCreateRequest(BaseModel):
    source_proforma_ids: list[int]
    issue_date: date | None = None
    due_date: date | None = None
    note: str | None = None

    @field_validator("source_proforma_ids")
    @classmethod
    def validate_source_proforma_ids(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("Vyberte alespoň jednu zdrojovou proformu.")
        if any(item <= 0 for item in value):
            raise ValueError("ID zdrojových proforem musí být kladná čísla.")
        deduplicated: list[int] = []
        seen: set[int] = set()
        for item in value:
            if item not in seen:
                seen.add(item)
                deduplicated.append(item)
        return deduplicated

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_dates(self) -> "FinalInvoiceCreateRequest":
        if self.issue_date is not None and self.due_date is not None and self.due_date < self.issue_date:
            raise ValueError("Datum splatnosti nemůže být dříve než datum vystavení.")
        return self


class CorrectionInvoiceCreateRequest(BaseModel):
    issue_date: date | None = None
    reason: str | None = None
    note: str | None = None

    @field_validator("reason", "note")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class InvoiceDefaultsResponse(BaseModel):
    document_kind: str
    suggested_invoice_number: str
    suggested_variable_symbol: str


class InvoiceSettingsUpdate(BaseModel):
    owner_email: str = Field(min_length=3, max_length=256)
    issuer_name: str | None = Field(default=None, max_length=256)
    issuer_address: str | None = Field(default=None, max_length=256)
    issuer_city: str | None = Field(default=None, max_length=128)
    issuer_zip: str | None = Field(default=None, max_length=32)
    issuer_ico: str | None = Field(default=None, max_length=32)
    issuer_dic: str | None = Field(default=None, max_length=32)
    issuer_data_box: str | None = Field(default=None, max_length=64)
    issuer_email: str | None = Field(default=None, max_length=256)
    issuer_phone: str | None = Field(default=None, max_length=64)
    default_currency: str | None = Field(default=None, min_length=3, max_length=8)
    default_due_days: int | None = Field(default=None)
    default_note: str | None = None
    payment_method: str = Field(min_length=1, max_length=64)
    bank_account_number: str = Field(min_length=1, max_length=32)
    bank_account_prefix: str | None = Field(default=None, max_length=16)
    bank_code: str = Field(min_length=1, max_length=16)
    bank_iban: str | None = Field(default=None, max_length=34)

    @field_validator("owner_email", "payment_method", "bank_account_number", "bank_code")
    @classmethod
    def validate_required_string(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Toto pole je povinné.")
        return cleaned

    @field_validator(
        "issuer_name",
        "issuer_address",
        "issuer_city",
        "issuer_zip",
        "issuer_ico",
        "issuer_dic",
        "issuer_data_box",
        "issuer_email",
        "issuer_phone",
        "bank_account_prefix",
        "bank_iban",
        "default_note",
    )
    @classmethod
    def normalize_optional_setting(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("default_currency")
    @classmethod
    def normalize_optional_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().upper()
        return cleaned or None

    @field_validator("default_due_days")
    @classmethod
    def validate_default_due_days(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value <= 0:
            raise ValueError("Výchozí splatnost musí být větší než nula.")
        if value > 365:
            raise ValueError("Výchozí splatnost může být maximálně 365 dnů.")
        return value


class InvoiceSettingsResponse(BaseModel):
    owner_email: str
    issuer_name: str
    issuer_address: str
    issuer_city: str
    issuer_zip: str
    issuer_ico: str
    issuer_dic: str
    issuer_data_box: str | None
    issuer_email: str | None
    issuer_phone: str | None
    default_currency: str
    default_due_days: int
    default_note: str | None
    payment_method: str
    bank_account_number: str
    bank_account_prefix: str | None
    bank_code: str
    bank_iban: str
    account_label: str
