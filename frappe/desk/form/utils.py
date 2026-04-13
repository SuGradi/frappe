# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: MIT. See LICENSE

import json
from typing import TYPE_CHECKING

import frappe
import frappe.desk.form.load
import frappe.desk.form.meta
from frappe import _
from frappe.core.doctype.file.utils import extract_images_from_html
from frappe.desk.form.document_follow import follow_document

if TYPE_CHECKING:
	from frappe.core.doctype.comment.comment import Comment


@frappe.whitelist(methods=["DELETE", "POST"])
def remove_attach():
	"""remove attachment"""
	fid = frappe.form_dict.get("fid")
	frappe.delete_doc("File", fid)


def _validate_attachment_delete_permission(doc):
	if not doc.has_permission("write"):
		raise frappe.PermissionError

	if not doc.meta.protect_attached_files:
		return

	if doc.docstatus == 0:
		return

	if doc.docstatus == 2 and doc.has_permission("delete"):
		return

	raise frappe.PermissionError


@frappe.whitelist(methods=["DELETE", "POST"])
def remove_attachments(dt: str | None = None, dn: str | None = None, file_ids=None):
	dt = dt or frappe.form_dict.get("dt")
	dn = dn or frappe.form_dict.get("dn")
	file_ids = file_ids or frappe.form_dict.get("file_ids") or "[]"
	file_ids = frappe.parse_json(file_ids)

	doc = frappe.get_doc(dt, dn)
	_validate_attachment_delete_permission(doc)

	files = {
		row.name: row
		for row in frappe.get_all(
			"File",
			fields=["name", "file_name", "attached_to_doctype", "attached_to_name"],
			filters={"name": ["in", file_ids]},
		)
	}

	deleted = []
	failed = []

	for file_id in file_ids:
		file_doc = files.get(file_id)
		if not file_doc:
			failed.append({"file_id": file_id, "file_name": None, "error": "File not found"})
			continue

		if file_doc.attached_to_doctype != dt or file_doc.attached_to_name != str(dn):
			failed.append(
				{
					"file_id": file_id,
					"file_name": file_doc.file_name,
					"error": "File is not attached to the requested document",
				}
			)
			continue

		try:
			frappe.delete_doc("File", file_id)
			deleted.append(file_id)
		except Exception:
			failed.append(
				{
					"file_id": file_id,
					"file_name": file_doc.file_name,
					"error": frappe.get_traceback(with_context=False).splitlines()[-1],
				}
			)

	return {"deleted": deleted, "failed": failed}


@frappe.whitelist(methods=["POST", "PUT"])
def add_comment(
	reference_doctype: str, reference_name: str, content: str, comment_email: str, comment_by: str
) -> "Comment":
	"""Allow logged user with permission to read document to add a comment"""
	reference_doc = frappe.get_doc(reference_doctype, reference_name)
	reference_doc.check_permission()

	comment = frappe.new_doc("Comment")
	comment.update(
		{
			"comment_type": "Comment",
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"comment_email": comment_email,
			"comment_by": comment_by,
			"content": extract_images_from_html(reference_doc, content, is_private=True),
		}
	)
	comment.insert(ignore_permissions=True)

	if frappe.get_cached_value("User", frappe.session.user, "follow_commented_documents"):
		follow_document(comment.reference_doctype, comment.reference_name, frappe.session.user)

	return comment


@frappe.whitelist()
def update_comment(name, content):
	"""allow only owner to update comment"""
	doc = frappe.get_doc("Comment", name)

	if frappe.session.user not in ["Administrator", doc.owner]:
		frappe.throw(_("Comment can only be edited by the owner"), frappe.PermissionError)

	if doc.reference_doctype and doc.reference_name:
		reference_doc = frappe.get_doc(doc.reference_doctype, doc.reference_name)
		reference_doc.check_permission()

		doc.content = extract_images_from_html(reference_doc, content, is_private=True)
	else:
		doc.content = content

	doc.save(ignore_permissions=True)


@frappe.whitelist()
def update_comment_publicity(name: str, publish: bool):
	doc = frappe.get_doc("Comment", name)
	if frappe.session.user != doc.owner and "System Manager" not in frappe.get_roles():
		frappe.throw(_("Comment publicity can only be updated by the original author or a System Manager."))

	doc.published = int(publish)
	doc.save(ignore_permissions=True)


@frappe.whitelist()
def get_next(doctype, value, prev, filters=None, sort_order="desc", sort_field="modified"):
	prev = int(prev)
	if not filters:
		filters = []
	if isinstance(filters, str):
		filters = json.loads(filters)

	# # condition based on sort order
	condition = ">" if sort_order.lower() == "asc" else "<"

	# switch the condition
	if prev:
		sort_order = "asc" if sort_order.lower() == "desc" else "desc"
		condition = "<" if condition == ">" else ">"

	# # add condition for next or prev item
	filters.append([doctype, sort_field, condition, frappe.get_value(doctype, value, sort_field)])

	res = frappe.get_list(
		doctype,
		fields=["name"],
		filters=filters,
		order_by=f"`tab{doctype}`.{sort_field}" + " " + sort_order,
		limit_start=0,
		limit_page_length=1,
		as_list=True,
	)

	if not res:
		frappe.msgprint(_("No further records"))
		return None
	else:
		return res[0][0]


def get_pdf_link(doctype, docname, print_format="Standard", no_letterhead=0):
	return f"/api/method/frappe.utils.print_format.download_pdf?doctype={doctype}&name={docname}&format={print_format}&no_letterhead={no_letterhead}"
