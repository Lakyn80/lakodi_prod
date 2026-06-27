"""ORM models for invoices."""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.app.db import Base

RELATION_TYPE_TAX_DOCUMENT_FOR_PAYMENT = "tax_document_for_payment"
RELATION_TYPE_FINAL_INVOICE_FOR_PROFORMA = "final_invoice_for_proforma"
RELATION_TYPE_CORRECTION_FOR_INVOICE = "correction_for_invoice"
RELATION_TYPE_INVOICE_FROM_QUOTE = "invoice_from_quote"
RELATION_TYPE_PROFORMA_FROM_QUOTE = "proforma_from_quote"


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(64), nullable=False, unique=True, index=True)
    variable_symbol = Column(String(9), nullable=False, unique=True, index=True)
    issue_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date, nullable=False)

    issuer_name = Column(String(256), nullable=False)
    issuer_address = Column(String(256), nullable=False)
    issuer_city = Column(String(128), nullable=False)
    issuer_zip = Column(String(32), nullable=False)
    issuer_ico = Column(String(32), nullable=False)
    issuer_dic = Column(String(32), nullable=False)
    issuer_data_box = Column(String(64), nullable=True)

    customer_name = Column(String(256), nullable=False)
    customer_email = Column(String(256), nullable=False, index=True)
    customer_phone = Column(String(64), nullable=True)
    customer_address = Column(String(256), nullable=True)
    customer_ico = Column(String(32), nullable=True)
    customer_dic = Column(String(32), nullable=True)
    subject_id = Column(Integer, ForeignKey("invoice_subjects.id", ondelete="SET NULL"), nullable=True, index=True)

    note = Column(Text, nullable=True)

    document_kind = Column(String(32), nullable=False, default="invoice", index=True)
    business_mode = Column(String(64), nullable=False, index=True)
    tax_mode = Column(String(64), nullable=False, index=True)
    currency = Column(String(8), nullable=False, default="CZK")
    subtotal = Column(Numeric(12, 2), nullable=False)
    vat_rate = Column(Numeric(5, 2), nullable=True)
    vat_amount = Column(Numeric(12, 2), nullable=False)
    total = Column(Numeric(12, 2), nullable=False)
    status = Column(String(64), nullable=False, default="draft", index=True)

    reverse_charge_reason = Column(String(256), nullable=True)
    reverse_charge_text = Column(Text, nullable=True)
    payment_method = Column(String(64), nullable=False)
    bank_account_number = Column(String(32), nullable=False)
    bank_account_prefix = Column(String(16), nullable=True)
    bank_code = Column(String(16), nullable=False)
    bank_iban = Column(String(34), nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    items = relationship(
        "InvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceItem.id",
    )
    payments = relationship(
        "InvoicePayment",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoicePayment.paid_at, InvoicePayment.id",
    )
    subject = relationship("InvoiceSubject", back_populates="invoices")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(512), nullable=False)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="items")


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    paid_at = Column(Date, nullable=False, index=True)
    payment_method = Column(String(64), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    invoice = relationship("Invoice", back_populates="payments")


class InvoiceDocumentRelation(Base):
    __tablename__ = "invoice_document_relations"
    __table_args__ = (
        UniqueConstraint(
            "source_payment_id",
            "relation_type",
            name="uq_invoice_document_relations_source_payment_relation_type",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    source_invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    target_invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    source_payment_id = Column(Integer, ForeignKey("invoice_payments.id", ondelete="CASCADE"), nullable=True, index=True)
    relation_type = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class InvoiceSequenceState(Base):
    __tablename__ = "invoice_sequence_states"

    id = Column(Integer, primary_key=True, index=True)
    sequence_key = Column(String(64), nullable=False, unique=True, index=True)
    document_kind = Column(String(32), nullable=True, index=True)
    sequence_year = Column(Integer, nullable=True, index=True)
    prefix = Column(String(32), nullable=True)
    last_number = Column(Integer, nullable=False, default=0)
    padding = Column(Integer, nullable=False, default=3)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class InvoiceSettings(Base):
    __tablename__ = "invoice_settings"

    id = Column(Integer, primary_key=True, index=True)
    owner_email = Column(String(256), nullable=False)
    issuer_name = Column(String(256), nullable=True)
    issuer_address = Column(String(256), nullable=True)
    issuer_city = Column(String(128), nullable=True)
    issuer_zip = Column(String(32), nullable=True)
    issuer_ico = Column(String(32), nullable=True)
    issuer_dic = Column(String(32), nullable=True)
    issuer_data_box = Column(String(64), nullable=True)
    issuer_email = Column(String(256), nullable=True)
    issuer_phone = Column(String(64), nullable=True)
    default_currency = Column(String(8), nullable=True)
    default_due_days = Column(Integer, nullable=True)
    default_note = Column(Text, nullable=True)
    payment_method = Column(String(64), nullable=False)
    bank_account_number = Column(String(32), nullable=False)
    bank_account_prefix = Column(String(16), nullable=True)
    bank_code = Column(String(16), nullable=False)
    bank_iban = Column(String(34), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class InvoiceSubject(Base):
    __tablename__ = "invoice_subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(256), nullable=False, index=True)
    email = Column(String(256), nullable=False, index=True)
    phone = Column(String(64), nullable=True)
    address = Column(String(256), nullable=False)
    ico = Column(String(32), nullable=True, index=True)
    dic = Column(String(32), nullable=True, index=True)
    data_box = Column(String(64), nullable=True)
    country = Column(String(128), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    invoices = relationship("Invoice", back_populates="subject")


class InvoiceExpense(Base):
    __tablename__ = "invoice_expenses"

    id = Column(Integer, primary_key=True, index=True)
    supplier_name = Column(String(256), nullable=False)
    supplier_email = Column(String(256), nullable=False, index=True)
    supplier_phone = Column(String(64), nullable=True)
    supplier_address = Column(String(256), nullable=False)
    supplier_ico = Column(String(32), nullable=True)
    supplier_dic = Column(String(32), nullable=True)
    supplier_data_box = Column(String(64), nullable=True)
    expense_number = Column(String(64), nullable=False, unique=True, index=True)
    variable_symbol = Column(String(9), nullable=False, unique=True, index=True)
    issue_date = Column(Date, nullable=False, index=True)
    received_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date, nullable=False, index=True)
    taxable_supply_date = Column(Date, nullable=False, index=True)
    currency = Column(String(8), nullable=False, default="CZK")
    subtotal = Column(Numeric(12, 2), nullable=False)
    vat_rate = Column(Numeric(5, 2), nullable=True)
    vat_amount = Column(Numeric(12, 2), nullable=False)
    total = Column(Numeric(12, 2), nullable=False)
    status = Column(String(64), nullable=False, default="open", index=True)
    note = Column(Text, nullable=True)
    payment_method = Column(String(64), nullable=False)
    bank_account_number = Column(String(32), nullable=False)
    bank_account_prefix = Column(String(16), nullable=True)
    bank_code = Column(String(16), nullable=False)
    bank_iban = Column(String(34), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    items = relationship(
        "InvoiceExpenseItem",
        back_populates="expense",
        cascade="all, delete-orphan",
        order_by="InvoiceExpenseItem.id",
    )
    payments = relationship(
        "InvoiceExpensePayment",
        back_populates="expense",
        cascade="all, delete-orphan",
        order_by="InvoiceExpensePayment.paid_at, InvoiceExpensePayment.id",
    )


class InvoiceExpenseItem(Base):
    __tablename__ = "invoice_expense_items"

    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("invoice_expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(512), nullable=False)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)

    expense = relationship("InvoiceExpense", back_populates="items")


class InvoiceExpensePayment(Base):
    __tablename__ = "invoice_expense_payments"

    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("invoice_expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    paid_at = Column(Date, nullable=False, index=True)
    payment_method = Column(String(64), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    expense = relationship("InvoiceExpense", back_populates="payments")


class InvoiceTodo(Base):
    __tablename__ = "invoice_todos"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    expense_id = Column(Integer, ForeignKey("invoice_expenses.id", ondelete="SET NULL"), nullable=True, index=True)
    todo_type = Column(String(64), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="open", index=True)
    title = Column(String(256), nullable=False)
    message = Column(Text, nullable=True)
    due_date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
