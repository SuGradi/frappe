# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: MIT. See LICENSE

import json
from unittest.mock import patch

import frappe
from frappe.desk.form.linked_with import get_linked_docs, get_linked_doctypes
from frappe.desk.form.utils import remove_attachments
from frappe.tests.utils import FrappeTestCase


def make_test_doc():
	doc = frappe.new_doc("ToDo")
	doc.description = "Bulk attachment delete test"
	doc.save()
	return doc


class TestForm(FrappeTestCase):
	def _make_attachment(self, doc, file_name, content):
		return frappe.get_doc(
			{
				"doctype": "File",
				"file_name": file_name,
				"attached_to_doctype": doc.doctype,
				"attached_to_name": doc.name,
				"content": content,
			}
		).insert()

	def test_linked_with(self):
		results = get_linked_docs("Role", "System Manager", linkinfo=get_linked_doctypes("Role"))
		self.assertTrue("User" in results)
		self.assertTrue("DocType" in results)

	def test_remove_attachments_deletes_multiple_files(self):
		doc = make_test_doc()
		file_1 = self._make_attachment(doc, "bulk-delete-1.txt", "one")
		file_2 = self._make_attachment(doc, "bulk-delete-2.txt", "two")

		result = remove_attachments(doc.doctype, doc.name, json.dumps([file_1.name, file_2.name]))

		self.assertCountEqual(result["deleted"], [file_1.name, file_2.name])
		self.assertEqual(result["failed"], [])
		self.assertFalse(frappe.db.exists("File", file_1.name))
		self.assertFalse(frappe.db.exists("File", file_2.name))

	def test_remove_attachments_rejects_files_from_other_documents(self):
		doc = make_test_doc()
		other_doc = make_test_doc()
		file_1 = self._make_attachment(doc, "same-doc.txt", "one")
		other_file = self._make_attachment(other_doc, "other-doc.txt", "two")

		result = remove_attachments(doc.doctype, doc.name, json.dumps([file_1.name, other_file.name]))

		self.assertEqual(result["deleted"], [file_1.name])
		self.assertEqual(result["failed"][0]["file_id"], other_file.name)
		self.assertTrue(frappe.db.exists("File", other_file.name))

	def test_remove_attachments_returns_partial_failures(self):
		doc = make_test_doc()
		file_1 = self._make_attachment(doc, "partial-1.txt", "one")
		file_2 = self._make_attachment(doc, "partial-2.txt", "two")

		original_delete_doc = frappe.delete_doc

		def fake_delete_doc(doctype, name, *args, **kwargs):
			if name == file_2.name:
				raise frappe.ValidationError("boom")
			return original_delete_doc(doctype, name, *args, **kwargs)

		with patch("frappe.delete_doc", side_effect=fake_delete_doc):
			result = remove_attachments(doc.doctype, doc.name, json.dumps([file_1.name, file_2.name]))

		self.assertEqual(result["deleted"], [file_1.name])
		self.assertEqual(result["failed"][0]["file_id"], file_2.name)
		self.assertIn("boom", result["failed"][0]["error"])
		self.assertFalse(frappe.db.exists("File", file_1.name))
		self.assertTrue(frappe.db.exists("File", file_2.name))
