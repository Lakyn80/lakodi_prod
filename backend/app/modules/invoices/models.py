"""ORM models for invoices."""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.app.db import Base


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

    note = Column(Text, nullable=True)

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


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(512), nullable=False)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="items")


class InvoiceSequenceState(Base):
    __tablename__ = "invoice_sequence_states"

    id = Column(Integer, primary_key=True, index=True)
    sequence_key = Column(String(64), nullable=False, unique=True, index=True)
    last_number = Column(Integer, nullable=False, default=0)
    padding = Column(Integer, nullable=False, default=3)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class InvoiceSettings(Base):
    __tablename__ = "invoice_settings"

    id = Column(Integer, primary_key=True, index=True)
    owner_email = Column(String(256), nullable=False)
    payment_method = Column(String(64), nullable=False)
    bank_account_number = Column(String(32), nullable=False)
    bank_account_prefix = Column(String(16), nullable=True)
    bank_code = Column(String(16), nullable=False)
    bank_iban = Column(String(34), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
