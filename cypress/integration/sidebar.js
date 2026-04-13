const verify_attachment_visibility = (document, is_private) => {
	cy.visit(`/app/${document}`);

	const assertion = is_private ? "be.checked" : "not.be.checked";
	cy.get(".add-attachment-btn").click();

	cy.get_open_dialog()
		.find(".file-upload-area")
		.selectFile("cypress/fixtures/sample_image.jpg", {
			action: "drag-drop",
		});

	cy.get_open_dialog().findByRole("checkbox", { name: "Private" }).should(assertion);
};

const attach_file = (file, no_of_files = 1) => {
	let files = [];
	if (file) {
		files = [file];
	} else if (no_of_files > 1) {
		// attach n files
		files = [...Array(no_of_files)].map(
			(el, idx) =>
				"cypress/fixtures/sample_attachments/attachment-" +
				(idx + 1) +
				(idx == 0 ? ".jpg" : ".txt")
		);
	}

	cy.get(".add-attachment-btn").click();
	cy.get_open_dialog().find(".file-upload-area").selectFile(files, {
		action: "drag-drop",
	});
	cy.get_open_dialog().findByRole("button", { name: "Upload" }).click();
};

context("Sidebar", () => {
	before(() => {
		cy.visit("/");
		cy.login();
		cy.visit("/app");
		return cy
			.window()
			.its("frappe")
			.then((frappe) => {
				return frappe.call("frappe.tests.ui_test_helpers.create_blog_post");
			});
	});

	it("Verify attachment visibility config", () => {
		cy.call("frappe.tests.ui_test_helpers.create_todo", {
			description: "Sidebar Attachment ToDo",
		}).then((todo) => {
			verify_attachment_visibility(`todo/${todo.message.name}`, true);
		});
		verify_attachment_visibility("blog-post/test-blog-attachment-post", false);
	});

	it("Verify attachment accessibility UX", () => {
		cy.call("frappe.tests.ui_test_helpers.create_todo_with_attachment_limit", {
			description: "Sidebar Attachment Access Test ToDo",
		}).then((todo) => {
			cy.visit(`/app/todo/${todo.message.name}`);

			attach_file("cypress/fixtures/sample_image.jpg");
			cy.get(".explore-link").should("be.visible");
			cy.get(".show-all-btn").should("be.hidden");

			// attach 10 images
			attach_file(null, 10);
			cy.get(".show-all-btn").should("be.visible");

			// attach 1 more image to reach attachment limit
			attach_file("cypress/fixtures/sample_attachments/attachment-11.txt");
			cy.get(".add-attachment-btn").should("be.hidden");
			cy.get(".explore-link").should("be.visible");

			// test "Show All" button
			cy.get(".attachment-row").should("have.length", 10);
			cy.get(".show-all-btn").click({ force: true });
			cy.get(".attachment-row").should("have.length", 12);
		});
	});

	// Batch delete selectors:
	// .bulk-delete-attachment-btn
	// .attachment-bulk-actions
	// .attachment-selection-count
	// .attachment-delete-selected-btn
	// .attachment-cancel-selection-btn
	// .attachment-select-row
	it("supports batch deleting attachments from the sidebar", () => {
		cy.call("frappe.tests.ui_test_helpers.create_todo", {
			description: "Sidebar Bulk Delete ToDo",
		}).then((todo) => {
			cy.visit(`/app/todo/${todo.message.name}`);

			attach_file("cypress/fixtures/sample_attachments/attachment-2.txt");
			attach_file("cypress/fixtures/sample_attachments/attachment-3.txt");
			attach_file("cypress/fixtures/sample_attachments/attachment-4.txt");

			cy.get(".bulk-delete-attachment-btn").click();
			cy.get(".attachment-bulk-actions").should("be.visible");
			cy.get(".attachment-select-row input[type='checkbox']").should("have.length", 3);

			cy.get(".attachment-select-row input[type='checkbox']").eq(0).check({ force: true });
			cy.get(".attachment-select-row input[type='checkbox']").eq(1).check({ force: true });
			cy.get(".attachment-selection-count").should("contain", "2");

			cy.get(".attachment-delete-selected-btn").click();
			cy.findByRole("button", { name: "Yes" }).click();

			cy.get(".attachment-row").should("have.length", 1);
			cy.get(".attachment-bulk-actions").should("not.be.visible");
		});
	});

	it("cancels sidebar attachment selection mode", () => {
		cy.call("frappe.tests.ui_test_helpers.create_todo", {
			description: "Sidebar Bulk Delete Cancel ToDo",
		}).then((todo) => {
			cy.visit(`/app/todo/${todo.message.name}`);

			attach_file("cypress/fixtures/sample_attachments/attachment-5.txt");

			cy.get(".bulk-delete-attachment-btn").click();
			cy.get(".attachment-select-row input[type='checkbox']").check({ force: true });
			cy.get(".attachment-cancel-selection-btn").click();

			cy.get(".attachment-bulk-actions").should("not.be.visible");
			cy.get(".attachment-select-row input[type='checkbox']").should("not.exist");
		});
	});

	it('Test for checking "Assigned To" counter value, adding filter and adding & removing an assignment', () => {
		cy.call("frappe.tests.ui_test_helpers.create_todo", {
			description: "Sidebar Attachment ToDo",
		}).then((todo) => {
			let todo_name = todo.message.name;
			cy.visit("/app/todo");
			cy.click_sidebar_button("Assigned To");

			//To check if no filter is available in "Assigned To" dropdown
			cy.get(".empty-state").should("contain", "No filters found");

			//Assigning a doctype to a user
			cy.visit(`/app/todo/${todo_name}`);
			cy.get(".add-assignment-btn").click();
			cy.get_field("assign_to_me", "Check").click();
			cy.wait(1000);
			cy.get(".modal-footer > .standard-actions > .btn-primary").click();
			cy.visit("/app/todo");
			cy.click_sidebar_button("Assigned To");

			//To check if filter is added in "Assigned To" dropdown after assignment
			cy.get(
				".group-by-field.show > .dropdown-menu > .group-by-item > .dropdown-item"
			).should("contain", "1");

			//To check if there is no filter added to the listview
			cy.get(".filter-button").should("contain", "Filter");

			//To add a filter to display data into the listview
			cy.get(
				".group-by-field.show > .dropdown-menu > .group-by-item > .dropdown-item"
			).click();

			//To check if filter is applied
			cy.click_filter_button().get(".filter-label").should("contain", "1");
			cy.get(".fieldname-select-area > .awesomplete > .form-control").should(
				"have.value",
				"Assigned To"
			);
			cy.get(".condition").should("have.value", "like");
			cy.get(".filter-field > .form-group > .input-with-feedback").should(
				"have.value",
				`%${cy.config("testUser")}%`
			);
			cy.click_filter_button();

			//To remove the applied filter
			cy.clear_filters();

			//To remove the assignment
			cy.visit(`/app/todo/${todo_name}`);
			cy.get(".assignments > .avatar-group > .avatar > .avatar-frame").click();
			cy.get(".remove-btn").click({ force: true });
			cy.hide_dialog();
			cy.visit("/app/todo");
			cy.click_sidebar_button("Assigned To");
			cy.get(".empty-state").should("contain", "No filters found");
		});
	});
});
